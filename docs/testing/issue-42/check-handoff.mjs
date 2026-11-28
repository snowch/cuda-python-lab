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
  async function open(release) {
    const page = await context.newPage();
    await page.goto(base+release+'/index.html#lesson/vector-add');
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
  await fresh.locator('#work-copies summary').click();
  assert.equal(await fresh.locator('#work-copy-text').inputValue(),'Old release answer');
  console.log('Fresh release reopened the new marker and new answer. Recovery copy displayed the answer typed in the actual old release.');
  await axe(fresh,'conflict');
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
  await context.close();
} finally { for (const f of clean) await f(); await rm(root,{recursive:true,force:true}); }
