import assert from 'node:assert/strict';
import {mkdir, readFile} from 'node:fs/promises';
import test from 'node:test';
import {launchChromium, serveBuild} from './browser-support.mjs';
import {lessons} from '../src/course.mjs';
import {standaloneProgram} from '../src/host-program.mjs';
import {workKey} from '../src/learner-work.mjs';

const kernel = await readFile(new URL('../src/kernels/vector-add.py', import.meta.url), 'utf8');
const original = index => standaloneProgram(kernel, lessons['vector-add'].cases[index]);
const answer = page => page.locator('#prediction');
const editor = page => page.getByRole('textbox', {name:'Python program source'});
const status = page => page.locator('#work-status');
const durable = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), workKey);

async function open(context, url, slug = 'vector-add') {
  const page = await context.newPage();
  await page.goto(url + '#lesson/' + slug);
  await editor(page).waitFor();
  return page;
}

async function replace(page, value) {
  await editor(page).press('ControlOrMeta+a');
  await page.keyboard.insertText(value);
}

async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return readFile(await file.path(), 'utf8');
}

async function source(page) {
  const summary = page.locator('#editor-tools > summary');
  await summary.click();
  const value = await download(page, page.locator('#download-source'));
  await summary.click();
  return value;
}

const saved = page => status(page).filter({hasText:'Learner work saved'}).waitFor();
async function holdTransaction(page) {
  await page.evaluate(() => new Promise(held => {
    const request = indexedDB.open('cuda-python-lab-work', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('work', 'readwrite');
      tx.oncomplete = () => db.close();
      let holding = true;
      function keepBusy() {
        tx.objectStore('work').get('current').onsuccess = () => {
          held();
          if (holding) keepBusy();
        };
      }
      window.releaseSaveLock = () => { holding = false; };
      keepBusy();
    };
  }));
}

async function failWrites(page, name) {
  await page.evaluate(({key,name}) => {
    const set = Storage.prototype.setItem;
    window.failedWrites = 0;
    Storage.prototype.setItem = function(item, value) {
      if (item === key) { window.failedWrites++; throw new DOMException('Injected storage failure', name); }
      return set.call(this, item, value);
    };
    window.enableWrites = () => { Storage.prototype.setItem = set; };
  }, {key:workKey,name});
}

test('stale lessons survive both write and close orders in a fresh third tab', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t);
  for (const reverse of [false, true]) {
    const context = await browser.newContext();
    const vector = await open(context, url), stencil = await open(context, url, 'stencil');
    const marked = '# Original vector marker\n' + original(0);
    const actions = [
      async () => { await replace(vector, marked); await answer(vector).fill('Index 32 belongs to block 1'); await saved(vector); },
      async () => { await answer(stencil).fill('Boundary reads the halo'); await saved(stencil); },
    ];
    for (const act of reverse ? actions.reverse() : actions) await act();
    for (const page of reverse ? [stencil, vector] : [vector, stencil]) await page.close();
    const fresh = await open(context, url);
    assert.equal(await source(fresh), marked);
    assert.equal(await answer(fresh).inputValue(), 'Index 32 belongs to block 1');
    await fresh.goto(url + '#lesson/stencil');
    assert.equal(await answer(fresh).inputValue(), 'Boundary reads the halo');
    t.diagnostic(JSON.stringify({reverse, marker:marked.split('\n')[0], caseAnswers:(await durable(fresh)).caseAnswers}));
    const isolated = await browser.newContext();
    const independent = await open(isolated, url);
    assert.equal(await answer(independent).inputValue(), '');
    assert.equal(await source(independent), original(0));
    await isolated.close();
    await context.close();
  }
});

test('contending kernel, host, prediction, completion and case writes merge and restore/undo round-trips', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
  const a = await open(context, url), b = await open(context, url), c = await open(context, url);
  await c.locator('#case').selectOption('1');
  await saved(c);
  await holdTransaction(a);
  const editedKernel = program => ('# shared kernel\n' + program).replace('a[i] + b[i]', 'a[i] - b[i]');
  const host0 = '# host for case 0\n', host1 = '# host for case 1\n';
  await Promise.all([replace(a, editedKernel(original(0))), replace(b, original(0) + host0), replace(c, original(1) + host1)]);
  await answer(b).fill('A concurrent prediction');
  await c.locator('#complete').check();
  await status(a).filter({hasText:'Saving learner work'}).waitFor();
  assert.equal(await source(a), editedKernel(original(0)));
  assert.equal(await c.locator('#complete').getAttribute('aria-describedby'), 'completion-note');
  assert.equal(await c.getByRole('status').filter({hasText:'Saving progress…'}).innerText(), 'Saving progress…');
  assert.equal((await durable(c)).completed['vector-add'], undefined);
  assert.equal(await source(c), original(1) + host1);
  await a.evaluate(() => window.releaseSaveLock());
  const staleProgram = page => status(page).filter({hasText:'The open program differs from the saved version'});
  const staleBoth = page => status(page).filter({hasText:'The open program and prediction differ'});
  await Promise.all([staleBoth(a).waitFor(), staleProgram(b).waitFor(), staleProgram(c).waitFor()]);
  assert.equal(await c.locator('#completion-note').innerText(), 'Progress saved in this browser.');
  const record = await durable(b);
  assert.equal(record.drafts['vector-add'], editedKernel(kernel), JSON.stringify(record));
  assert.deepEqual(record.recoveryCopies, []);
  assert.equal(await source(b), original(0) + host0, 'remote edits never replace the open editor');
  const fresh = await open(context, url);
  assert.equal(await fresh.locator('#case').inputValue(), '1');
  assert.equal(await source(fresh), editedKernel(original(1)) + host1);
  await fresh.locator('#case').selectOption('0');
  assert.equal(await source(fresh), editedKernel(original(0)) + host0);
  assert.equal(await answer(fresh).inputValue(), 'A concurrent prediction');
  assert.equal(await fresh.locator('#complete').isChecked(), true);
  const before = original(0) + host0, after = editedKernel(original(0)) + host0;
  for (const [page, program, multiplier] of [[b, before, 3], [fresh, after, -1]]) {
    await page.locator('#run').click();
    await page.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
    const values = JSON.parse((await page.locator('#run-output').innerText()).split(' = ')[1]);
    assert.deepEqual(values, Array.from({length:33}, (_, i) => multiplier * (i+1)));
    await page.waitForFunction(({key, program}) => JSON.parse(localStorage.getItem(key)).results['vector-add'][0].source === program, {key:workKey, program});
    assert.equal(await source(page), program);
    t.diagnostic('Vector export matched the executed source byte for byte; GPGPU-Sim output: ' + JSON.stringify(values));
  }
  await b.locator('#editor-review').click();
  assert.equal(await b.locator('#latest-version [data-program]').inputValue(), after);
  await b.locator('#latest-version [data-load]').click();
  await saved(b);
  assert.equal(await source(b), after);

  await fresh.locator('#editor-tools > summary').click();
  await fresh.locator('#restore').click();
  await saved(fresh);
  await answer(b).fill('Stale tab wrote after restore');
  await staleProgram(b).waitFor();
  await fresh.reload();
  await editor(fresh).waitFor();
  assert.equal(await source(fresh), original(0));
  await fresh.locator('#editor-tools > summary').click();
  await fresh.locator('#undo-restore').click();
  await saved(fresh);
  await fresh.reload();
  await editor(fresh).waitFor();
  assert.equal(await source(fresh), editedKernel(original(0)) + host0);
  assert.equal(await answer(fresh).inputValue(), 'Stale tab wrote after restore');
  t.diagnostic('Fresh case 0 and 1 exports matched the complete expected programs byte for byte, including the shared kernel and separate case host markers.');
  await context.close();
});

async function screenshots(page, mode) {
  await mkdir('test-results/learner-work', {recursive:true});
  for (const width of [390,820,1440]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({colorScheme:theme});
    await page.locator('.work-save').evaluate(el => el.scrollIntoView({block:'center'}));
    await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page fits viewport');
    for (const item of await page.locator('.work-save :is(button,summary,select,textarea):visible').all()) {
      const box = await item.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, 'visible control fits viewport');
    }
    await page.screenshot({path:'test-results/learner-work/' + [mode,width,theme].join('-') + '.png'});
  }
}

test('same draft and prediction retain both versions, including a keyboard-accessible recovery copy', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context, url), b = await open(context, url);
  const first = '# first kernel\n' + original(0) + '# first host\n';
  const second = '# second kernel\n' + original(0) + '# second host\n';
  await replace(a, first);
  await answer(a).fill('First answer');
  await saved(a);
  await screenshots(a, 'saved');
  await replace(b, second);
  await answer(b).fill('Second answer');
  await saved(b);
  const page = await open(context, url);
  assert.equal(await source(page), second);
  assert.equal(await answer(page).inputValue(), 'Second answer');
  await answer(page).focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'export-work');
  const backup = JSON.parse(await download(page, page.locator('#export-work')));
  assert.equal(backup.durable.programs['vector-add']['0'], second);
  assert.equal(backup.recoveryCopies.find(copy => copy.path[0] === 'programs').value, first);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').evaluate(el => el.tagName), 'SUMMARY');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'work-version');
  const prediction = backup.recoveryCopies.find(copy => copy.path[0] === 'caseAnswers');
  await page.locator('#work-version').selectOption(prediction.id);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'work-copy-text');
  assert.equal(await page.locator('#work-copy-text').inputValue(), 'First answer');
  await screenshots(page, 'conflict');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('id'), 'remove-copy');
  page.once('dialog', dialog => dialog.accept());
  await page.keyboard.press('Enter');
  await page.waitForFunction(id => ![...document.querySelector('#work-version').options].some(o => o.value === id), prediction.id);
  assert.equal(await answer(a).inputValue(), 'First answer');
  t.diagnostic('Second full program and answer reopened. Export retained first full program and answer. Review, copy and removal controls reached by keyboard.');
  await context.close();
});

test('quota and denied writes retain in-memory work, allow export, warn before unload and retry', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t);
  for (const name of ['QuotaExceededError','SecurityError']) {
    const context = await browser.newContext(), page = await open(context, url);
    if (name === 'SecurityError') {
      await page.addInitScript(key => {
        const get = Storage.prototype.getItem;
        Storage.prototype.getItem = function(item) {
          if (item === key && !window.allowRead) throw new DOMException('Denied','SecurityError');
          return get.call(this,item);
        };
      }, workKey);
      await page.reload(); await editor(page).waitFor();
      await status(page).filter({hasText:'could not be saved'}).waitFor();
    }
    await failWrites(page, name);
    const value = 'Keep this ' + name + ' prediction', marked = '# ' + name + '\n' + original(0);
    await replace(page, marked); await answer(page).fill(value);
    await status(page).filter({hasText:'could not be saved'}).waitFor();
    await page.goto(url + '#lesson/stencil'); await editor(page).waitFor();
    await page.goto(url + '#lesson/vector-add'); await editor(page).waitFor();
    assert.equal(await answer(page).inputValue(), value);
    assert.equal(await source(page), marked);
    assert.equal(await page.evaluate(() => !dispatchEvent(new Event('beforeunload',{cancelable:true}))), true);
    await answer(page).focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'retry-save');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'export-work');
    const backup = JSON.parse(await download(page, page.locator('#export-work')));
    assert.equal(backup.tab.caseAnswers['vector-add']['partial-32'], value);
    assert.equal(backup.tab.programs['vector-add'][0], marked);
    if (name === 'QuotaExceededError') await screenshots(page, 'failed');
    const fresh = await open(context, url);
    assert.equal(await answer(fresh).inputValue(), '');
    assert.equal(await source(fresh), original(0));
    if (name === 'SecurityError') {
      await page.evaluate(() => { window.allowRead = true; });
      await page.locator('#retry-save').click();
    }
    await page.waitForFunction(() => window.failedWrites > 0);
    await status(page).filter({hasText:'could not be saved'}).waitFor();
    await page.evaluate(() => window.enableWrites());
    await page.locator('#retry-save').click();
    await saved(page);
    assert.equal(await page.evaluate(() => dispatchEvent(new Event('beforeunload',{cancelable:true}))), true);
    await fresh.reload(); await editor(fresh).waitFor();
    assert.equal(await answer(fresh).inputValue(), value);
    assert.equal(await source(fresh), marked);
    t.diagnostic(name + ': tab export contained complete code and prediction; fresh tab was empty before retry and exact after retry.');
    await context.close();
  }
});

test('legacy v1 work and stale per-window handoff import once without replacing newer work', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const page = await context.newPage();
  const oldKey = 'cuda-python-lab:restart:/';
  const current = {drafts:{'vector-add':'# current\n' + kernel}, predictions:{'vector-add':'current durable answer'}, completed:{'vector-add':true}};
  const legacy = {schema:1, hash:'#lesson/vector-add', scroll:[0,0], details:[], controls:[['case','1'],['prediction','stale snapshot answer']],
    work:{predictions:{'vector-add':'stale snapshot answer',stencil:'only in old window'}, completed:{'vector-add':false},
      restoredPrograms:{'vector-add':{1:'# recovered undo\n' + original(1)}}, results:{'vector-add':{1:{output:'old output'}}}}};
  await page.addInitScript(({key,oldKey,current,legacy}) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded','1');
    localStorage.setItem(key,JSON.stringify(current));
    sessionStorage.setItem(oldKey,JSON.stringify(legacy));
  }, {key:workKey,oldKey,current,legacy});
  await page.goto(url + '#lesson/vector-add'); await editor(page).waitFor(); await saved(page);
  assert.equal(await page.locator('#case').inputValue(), '1');
  assert.equal(await source(page), '# current\n' + original(1));
  assert.equal(await answer(page).inputValue(), '');
  await page.locator('#earlier-prediction summary').click();
  assert.equal(await page.locator('#legacy-answer').inputValue(), 'current durable answer');
  const record = await durable(page);
  assert.deepEqual(record.completed, current.completed);
  assert.equal(record.predictions.stencil, 'only in old window');
  assert.deepEqual(record.restoredPrograms, legacy.work.restoredPrograms);
  assert.deepEqual(record.results, legacy.work.results);
  assert.equal(record.recoveryCopies.length, 1);
  assert.equal(record.recoveryCopies[0].value, 'stale snapshot answer');
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), oldKey), null);
  await page.reload(); await editor(page).waitFor();
  assert.deepEqual((await durable(page)).recoveryCopies, record.recoveryCopies);
  t.diagnostic('Legacy-only answer, result and undo retained. Durable code, answer and completion retained. Stale answer available once in recovery.');
  await context.close();
});

test('full history leaves the next edit pending until a learner frees space', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context,url), b = await open(context,url);
  const path = ['caseAnswers','vector-add','partial-32'];
  const history = Array.from({length:16}, (_,i) => ({path, id:String(i), value:'earlier '+i, savedAt:'2025-01-01T00:00:00Z'}));
  await a.evaluate(({key,history}) => localStorage.setItem(key,JSON.stringify({recoveryCopies:history})), {key:workKey,history});
  await answer(a).fill('Already durable'); await saved(a);
  await answer(b).fill('Incoming edit');
  await status(b).filter({hasText:'Recovery copies are full'}).waitFor();
  assert.equal((await durable(b)).caseAnswers['vector-add']['partial-32'], 'Already durable');
  assert.deepEqual((await durable(b)).recoveryCopies, history);
  const backup = JSON.parse(await download(b, b.locator('#export-work')));
  assert.equal(backup.tab.caseAnswers['vector-add']['partial-32'], 'Incoming edit');
  await b.locator('#work-copies > summary').click();
  b.once('dialog', d => d.accept()); await b.locator('#remove-copy').click();
  await saved(b);
  const after = await durable(b);
  assert.equal(after.caseAnswers['vector-add']['partial-32'],'Incoming edit');
  assert.equal(after.recoveryCopies.length,16);
  assert.ok(after.recoveryCopies.some(copy => copy.value === 'Already durable'));
  assert.deepEqual(after.recoveryCopies.slice(0,15),history.slice(1));
  await context.close();
});

test('a stale tab preserves actual GPGPU-Sim outputs for both cases', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
  const a = await open(context,url), b = await open(context,url);
  await b.locator('#case').selectOption('1');
  const outputs = [];
  for (const [index, page] of [a,b].entries()) {
    await page.locator('#run').click();
    await page.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
    const output = await page.locator('#run-output').textContent();
    const values = JSON.parse(output.split(' = ')[1]);
    assert.deepEqual(values, lessons['vector-add'].cases[index].expected);
    outputs.push(output);
    t.diagnostic('GPGPU-Sim · ' + lessons['vector-add'].cases[index].label + ' · ' + output);
  }
  await answer(a).fill('Stale tab writes after both runs'); await saved(a);
  const fresh = await open(context,url);
  for (const [index,output] of outputs.entries()) {
    await fresh.locator('#case').selectOption(String(index));
    assert.equal(await fresh.locator('#run-output').textContent(), output);
    assert.equal((await durable(fresh)).results['vector-add'][index].source, original(index));
  }
  await context.close();
});

test('a previous release writing the v1 record cannot erase a transactional save', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context,url);
  const marker = '# new release marker\n' + original(0);
  await replace(a, marker); await answer(a).fill('Transactional answer'); await saved(a);
  // This is the previous release's on-disk write format, including unknown properties.
  await a.evaluate(key => {
    const old = JSON.parse(localStorage.getItem(key));
    old.predictions = {'vector-add':'Legacy answer', stencil:'Legacy-only answer'};
    old.programs = {}; old.drafts = {};
    localStorage.setItem(key,JSON.stringify(old));
  }, workKey);
  await a.close();
  const fresh = await open(context,url);
  assert.equal(await source(fresh), marker);
  assert.equal(await answer(fresh).inputValue(),'Transactional answer');
  const record = await durable(fresh);
  assert.equal(record.predictions.stencil,'Legacy-only answer');
  assert.equal(record.predictions['vector-add'],'Legacy answer');
  await fresh.locator('#earlier-prediction summary').click();
  assert.equal(await fresh.locator('#legacy-answer').inputValue(),'Legacy answer');
  await context.close();
});

test('interruption between the v1 mirror and the final database commit retains both answers', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context,url);
  await answer(a).fill('Committed answer'); await saved(a);
  await a.evaluate(key => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(item,value) {
      set.call(this,item,value);
      if (item === key) throw Error('Interrupted after mirror write.');
    };
  },workKey);
  await answer(a).fill('Interrupted answer');
  await status(a).filter({hasText:'could not be saved'}).waitFor();
  const reopened = await open(context,url);
  assert.equal(await answer(reopened).inputValue(),'Committed answer');
  await reopened.locator('#work-copies summary').click();
  assert.equal(await reopened.locator('#work-copy-text').inputValue(),'Interrupted answer');
  assert.equal(await answer(a).inputValue(),'Interrupted answer');
  await context.close();
});

test('review tracks the effective case and prediction, leaves focus intact and validates the preview', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context,url), b = await open(context,url), other = await open(context,url,'stencil');
  const latest = b.locator('#latest-version'), load = latest.locator('[data-load]');
  await b.locator('#case').selectOption('1');
  const own = original(1) + '# case one host\n';
  await replace(b,own); await saved(b);
  await answer(other).fill('Different lesson'); await saved(other);
  await replace(a,original(0) + '# different case host\n'); await saved(a);
  await a.locator('#complete').check(); await b.waitForFunction(() => document.querySelector('#complete').checked);
  assert.equal(await latest.isHidden(),true);
  await editor(b).press('Control+Home'); await editor(b).press('Shift+End');
  const selection = () => b.evaluate(() => [document.activeElement.getAttribute('aria-label'), getSelection().toString()]);
  const before = await selection();
  assert.deepEqual(before,['Python program source',own.split('\n')[0]]);
  await replace(a,'# latest shared kernel\n'+original(0) + '# different case host\n'); await saved(a);
  await status(b).filter({hasText:'The open program differs'}).waitFor();
  assert.equal((await durable(b)).programs['vector-add'][1],own, 'case-one serialization still embeds the older kernel');
  assert.deepEqual(await selection(),before);
  await answer(a).fill('Only case zero'); await saved(a);
  assert.match(await status(b).innerText(), /open program differs/);
  await a.locator('#case').selectOption('1'); await saved(a);
  await answer(a).fill('Latest prediction'); await saved(a);
  await status(b).filter({hasText:'The open program and prediction differ'}).waitFor();
  assert.deepEqual(await selection(),before);
  await screenshots(b,'stale');
  await latest.locator('summary').focus(); await b.keyboard.press('Enter');
  const backup = JSON.parse(await download(b,b.locator('#export-work')));
  assert.deepEqual(backup.openLesson, {slug:'vector-add',caseIndex:1,caseId:'partial-16',program:own,prediction:''});
  const merged = '# latest shared kernel\n' + own;
  assert.equal(await latest.locator('[data-program]').inputValue(),merged);
  assert.equal(await latest.locator('[data-answer]').inputValue(),'Latest prediction');
  await screenshots(b,'review');
  await answer(a).fill('Revised while preview was open'); await saved(a);
  await latest.locator('[data-review]').waitFor();
  assert.ok(await load.isDisabled());
  assert.equal(await latest.locator('[data-answer]').inputValue(),'Latest prediction');
  await latest.locator('[data-review]').click();
  assert.equal(await latest.locator('[data-answer]').inputValue(),'Revised while preview was open');
  await b.keyboard.press('Enter'); await saved(b);
  assert.ok(await editor(b).evaluate(el => el === document.activeElement));
  assert.equal(await source(b),merged);
  assert.equal(await answer(b).inputValue(),'Revised while preview was open');
  await answer(a).fill('One more prediction'); await saved(a);
  await status(b).filter({hasText:'The open prediction differs'}).waitFor();
  await latest.locator('summary').click();
  assert.ok(await latest.locator('[data-program]').isHidden());
  await load.click(); await saved(b);
  assert.equal(await answer(b).inputValue(),'One more prediction');
  assert.equal(await b.locator(':focus').getAttribute('id'),'prediction');
  await context.close();
});

test('loading a reviewed version cannot replace edits made while its database read waits or fails', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context,url), b = await open(context,url);
  await answer(a).fill('Saved elsewhere'); await saved(a);
  await status(b).filter({hasText:'The open prediction differs'}).waitFor();
  const latest = b.locator('#latest-version'), load = latest.locator('[data-load]');
  await latest.locator('summary').click();
  await holdTransaction(a);
  await load.click();
  await failWrites(b,'QuotaExceededError');
  await answer(b).fill('Unsaved local edit');
  await b.locator('#complete').check();
  assert.ok(await load.isDisabled());
  assert.equal(await b.locator('#completion-note').innerText(),'Saving progress…');
  await a.evaluate(() => window.releaseSaveLock());
  await status(b).filter({hasText:'could not be saved'}).waitFor();
  assert.ok(await load.isDisabled());
  assert.match(await b.locator('#completion-note').innerText(),/Save unavailable/);
  assert.equal(await answer(b).inputValue(),'Unsaved local edit');
  const dump = JSON.parse(await download(b,b.locator('#export-work')));
  assert.equal(dump.tab.caseAnswers['vector-add']['partial-32'],'Unsaved local edit');
  assert.equal(dump.durable.caseAnswers['vector-add']['partial-32'],'Saved elsewhere');
  assert.equal(dump.durable.completed['vector-add'],undefined);
  await b.evaluate(()=>window.enableWrites()); await b.locator('#retry-save').click();
  await saved(b);
  assert.ok(await latest.isHidden());
  assert.equal((await durable(b)).caseAnswers['vector-add']['partial-32'],'Unsaved local edit');
  assert.equal(await b.locator('#completion-note').innerText(),'Progress saved in this browser.');
  await context.close();
});

test('guided preparation preserves dirty work across contention, storage denial, undo and reopen', async t => {
  const url = await serveBuild(t), browser = await launchChromium(t), context = await browser.newContext();
  const a = await open(context,url), b = await open(context,url);
  const draft = '# my grid calculation\n' + original(0) + '# my host result\n';
  await replace(a,draft); await saved(a);
  await a.locator('#guided-task').selectOption('narrow');
  assert.equal(await source(a),draft);
  const prepare=a.locator('#prepare-task'), undo=a.locator('#undo-prepare');
  assert.match(await a.locator('#setup-status').innerText(),/shared kernel.*host code/);
  await holdTransaction(b);
  await answer(a).fill('There will be three blocks.');
  assert.ok(await prepare.isDisabled());
  await b.evaluate(()=>window.releaseSaveLock()); await saved(a);
  await failWrites(a,'QuotaExceededError');
  await prepare.click();
  await status(a).filter({hasText:'could not be saved'}).waitFor();
  assert.equal(await source(a),original(0));
  const backup=JSON.parse(await download(a,a.locator('#export-work')));
  assert.equal(backup.tab.preparations['vector-add']['partial-32'],draft);
  assert.equal(backup.durable.programs['vector-add'][0],draft);
  assert.equal(backup.openLesson.program,original(0));
  await a.evaluate(()=>window.enableWrites());await a.locator('#retry-save').click();await saved(a);
  await a.reload();await editor(a).waitFor();
  await undo.click();await saved(a);
  assert.equal(await source(a),draft);
  const fresh=await open(context,url);assert.equal(await source(fresh),draft);
  assert.equal(await answer(fresh).inputValue(),'There will be three blocks.');
  const latest='# a newer shared kernel\n'+draft;
  await replace(fresh,latest);await saved(fresh);
  await status(a).filter({hasText:'open program differs'}).waitFor();
  assert.ok(await prepare.isDisabled()); assert.ok(await undo.isDisabled());
  await a.locator('#latest-version summary').click();await a.locator('[data-load]').click();
  assert.equal(await source(a),latest);
  await holdTransaction(b);
  await prepare.click();
  await replace(a,draft+'# typed while checking\n');
  await b.evaluate(()=>window.releaseSaveLock());await saved(a);
  assert.equal(await source(a),draft+'# typed while checking\n');
  assert.equal((await durable(a)).preparations['vector-add']['partial-32'],original(0));
  await context.close();
});

test('case answers remain separate and an ambiguous legacy answer stays available', async t => {
  const url=await serveBuild(t),browser=await launchChromium(t),context=await browser.newContext();
  const a=await context.newPage();
  await a.addInitScript(key=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({predictions:{softmax:'My original row question'}}));
  },workKey);
  await a.goto(url+'#lesson/softmax');await editor(a).waitFor();
  const b=await open(context,url,'softmax');
  await b.locator('#guided-task').selectOption('lane');
  assert.equal(await b.locator('#case').inputValue(),'1');
  assert.match(await b.locator('#prediction-prompt').innerText(),/37 columns/);
  assert.match(await a.locator('#prediction-prompt').innerText(),/1000/);
  assert.equal(await answer(b).inputValue(),'');
  await a.locator('#earlier-prediction summary').click();
  assert.equal(await a.locator('#legacy-answer').inputValue(),'My original row question');
  await holdTransaction(a);
  await Promise.all([answer(a).fill('Columns 0 and 2 tie'),answer(b).fill('Columns 0 and 32')]);
  await a.evaluate(()=>window.releaseSaveLock());
  await Promise.all([saved(a),saved(b)]);
  const r=await durable(a);
  assert.deepEqual(r.caseAnswers.softmax,{extreme:'Columns 0 and 2 tie','wide-37':'Columns 0 and 32'});
  assert.deepEqual(r.recoveryCopies,[]);
  for(const id of ['sums','lane','sums']){
    await b.locator('#guided-task').selectOption(id);
    assert.equal(await answer(b).inputValue(),id==='lane'?'Columns 0 and 32':'Columns 0 and 2 tie');
  }
  await b.goto(url+'#lesson/gather');await b.locator('#guided-task').selectOption('spaced');
  await b.goto(url+'#lesson/softmax');await b.reload();await editor(b).waitFor();
  assert.equal(await answer(b).inputValue(),'Columns 0 and 2 tie');
  assert.equal((await durable(b)).predictions.softmax,'My original row question');
  assert.deepEqual((await durable(b)).recoveryCopies,[]);
  await context.close();
});
