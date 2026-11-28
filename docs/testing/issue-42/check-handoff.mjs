import assert from 'node:assert/strict';
import {mkdtemp, symlink, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveBuild, launchChromium} from '../../../tests/browser-support.mjs';

const clean = [], t = {after:f => clean.unshift(f), diagnostic:console.log};
const root = await mkdtemp('/tmp/learner-work-handoff-');
try {
  await symlink(resolve(process.env.OLD_DIST), root+'/old');
  await symlink(resolve('dist'), root+'/new');
  const base = await serveBuild(t,{directory:pathToFileURL(root+'/')});
  const browser = await launchChromium(t), context = await browser.newContext();
  async function open(release, slug = 'vector-add') {
    const page = await context.newPage();
    await page.goto(base+release+'/index.html#lesson/'+slug);
    await page.locator('.cm-content').waitFor();
    return page;
  }
  async function axe(page, mode) {
    await page.addScriptTag({path:process.env.AXE_JS});
    const r = await page.evaluate(async () => {
      const report = await window.axe.run('.work-save');
      return {version:window.axe.version, failures:report.violations.map(v=>v.id), incomplete:report.incomplete.map(v=>v.id)};
    });
    console.log(mode, 'save panel accessibility scan', JSON.stringify(r));
    assert.deepEqual(r.failures,[]);
  }
  const old = await open('old'), now = await open('new');
  const saved = p => p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
  await now.locator('.cm-content').press('Control+Home');
  await now.keyboard.insertText('# retained across upgrades\n');
  await now.locator('#prediction').fill('New release answer');
  await saved(now);
  await axe(now,'saved');
  await old.locator('#prediction').fill('Old release answer');
  await old.close(); await now.close();
  const fresh = await open('new');
  await saved(fresh);
  assert.match(await fresh.locator('.cm-content').innerText(),/# retained across upgrades/);
  assert.equal(await fresh.locator('#prediction').inputValue(),'New release answer');
  await fresh.locator('#earlier-prediction summary').click();
  assert.equal(await fresh.locator('#legacy-answer').inputValue(),'Old release answer');
  console.log('Fresh release reopened the new marker and new answer. Earlier lesson prediction displayed the answer typed in the actual old release.');
  await axe(fresh,'legacy answer');
  await fresh.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      if (this.name === 'work') throw new DOMException('Injected database quota','QuotaExceededError');
      return put.apply(this,args);
    };
    window.restoreDatabase = () => { IDBObjectStore.prototype.put = put; };
  });
  await fresh.locator('#prediction').fill('After IndexedDB abort');
  await fresh.locator('#work-status').filter({hasText:'could not be saved'}).waitFor();
  const observer = await open('new');
  assert.equal(await observer.locator('#prediction').inputValue(),'New release answer');
  const dialogShown = fresh.waitForEvent('dialog',{timeout:5000});
  await fresh.evaluate(() => { setTimeout(()=>location.reload(),0); });
  const dialog = await dialogShown;
  assert.equal(dialog.type(),'beforeunload'); await dialog.dismiss();
  assert.equal(await fresh.locator('#prediction').inputValue(),'After IndexedDB abort');
  console.log('Chromium displayed beforeunload on an actual reload. Dismissing the prompt retained the unsaved answer. The observer still had the previous commit.');
  await axe(fresh,'failed');
  await fresh.evaluate(() => window.restoreDatabase());
  await fresh.locator('#retry-save').click(); await saved(fresh);
  await observer.reload(); await observer.locator('.cm-content').waitFor();
  assert.equal(await observer.locator('#prediction').inputValue(),'After IndexedDB abort');
  console.log('Retry after the IndexedDB failure committed the exact edited answer in the observer.');
  await observer.locator('#prediction').fill('A second current-release answer'); await saved(observer);
  await fresh.locator('#work-status').filter({hasText:'The open prediction differs'}).waitFor();
  await axe(fresh,'stale prediction');
  await fresh.locator('#latest-version summary').click();
  assert.equal(await fresh.locator('#latest-version [data-answer]').inputValue(),'A second current-release answer');
  await axe(fresh,'saved version preview');

  // Stretch the real new writer's read-to-mirror interval. Neither writer's
  // values nor its storage operations are mocked. Keep the transaction alive
  // with real reads while the actual earlier release accepts learner input.
  const legacy = await open('old','stencil'), newer = await open('new');
  await newer.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      const request = original.apply(this,args);
      if (this.name !== 'work') return request;
      IDBObjectStore.prototype.put = original;
      const store = this;
      Object.defineProperty(request, 'onsuccess', {set(writeMirror) {
        request.addEventListener('success', event => {
          window.atMirrorGap = true;
          function waitForOldWriter() {
            store.get('current').onsuccess = () => {
              if (window.releaseMirror) writeMirror.call(request,event);
              else waitForOldWriter();
            };
          }
          waitForOldWriter();
        });
      }});
      return request;
    };
  });
  await newer.locator('#prediction').fill('Transactional update spanning legacy input');
  await newer.waitForFunction(() => window.atMirrorGap);
  const legacyAnswer = 'Legacy edit between new mirror read and write';
  await legacy.locator('#prediction').fill(legacyAnswer);
  assert.equal(await legacy.evaluate(() => JSON.parse(localStorage.getItem('cuda-python-lab-v1')).predictions.stencil),legacyAnswer);
  await newer.evaluate(() => {window.releaseMirror = true;}); await saved(newer);
  const next = await open('new','stencil');
  assert.equal(await legacy.locator('#prediction').inputValue(),legacyAnswer);
  assert.equal(await next.locator('#prediction').inputValue(),'');
  const current = await next.evaluate(() => JSON.parse(localStorage.getItem('cuda-python-lab-v1')));
  assert.equal(current.caseAnswers['vector-add']['partial-32'],'Transactional update spanning legacy input');
  assert.ok(!JSON.stringify(current).includes(legacyAnswer));
  console.log('Deliberate mixed-release overlap: the old answer reached the mirror after the new read. The new commit replaced the mirror; no copy of the old answer reopened. Its original old tab still showed the answer.');
  await context.close();
} finally { for (const f of clean) await f(); await rm(root,{recursive:true,force:true}); }
