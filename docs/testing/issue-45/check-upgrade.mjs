// Run against the built parent of issue #45 and the built PR on the same origin.
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const dir=await mkdtemp('/tmp/cuda-guided-upgrade-'),clean=[];
const t={after:f=>clean.unshift(f),diagnostic:console.log};
try {
  await symlink(resolve(process.env.OLD_DIST),dir+'/old');await symlink(resolve('dist'),dir+'/new');
  const url=await serveBuild(t,{directory:pathToFileURL(dir+'/')}),browser=await launchChromium(t),ctx=await browser.newContext();
  async function open(build,slug){
    const p=await ctx.newPage();await p.goto(url+build+'/index.html#lesson/'+slug);await p.locator('.cm-content').waitFor();return p;
  }
  const saved=p=>p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
  const old=await open('old','softmax');
  await old.locator('#prediction').fill('My earlier normalization question');await saved(old);
  await old.locator('.cm-content').press('Control+Home');await old.keyboard.insertText('# retain this learner kernel\n');await saved(old);
  const upgraded=await open('new','softmax');
  await upgraded.locator('#earlier-prediction summary').click();
  assert.equal(await upgraded.locator('#legacy-answer').inputValue(),'My earlier normalization question');
  assert.equal(await upgraded.locator('#prediction').inputValue(),'');
  assert.match(await upgraded.locator('.cm-content').innerText(),/retain this learner kernel/);
  await upgraded.locator('#guided-task').selectOption('lane');
  await upgraded.locator('#prediction').fill('Lane 0 writes twice');await saved(upgraded);
  await old.locator('#prediction').fill('Old tab edited after the case answer');await saved(old);
  const fresh=await open('new','softmax');
  assert.equal(await fresh.locator('#prediction').inputValue(),'Lane 0 writes twice');
  await fresh.locator('#earlier-prediction summary').click();
  assert.equal(await fresh.locator('#legacy-answer').inputValue(),'Old tab edited after the case answer');
  console.log('The PR #44 transactional writer preserved the new case answer when it next wrote its own lesson-wide answer. Fresh upgraded tab retained the old kernel and displayed the unassigned answer separately.');
  const oldSingle=await open('old','first-value');await oldSingle.locator('#prediction').fill('Expect 42');await saved(oldSingle);
  const single=await open('new','first-value');
  assert.equal(await single.locator('#prediction').inputValue(),'Expect 42');
  await single.locator('#prediction').fill('I predict 73 after the edit');await saved(single);
  const verified=await open('new','first-value');
  // A second page reads a fresh database checkpoint; both independently served releases are still active.
  assert.equal(await verified.locator('#prediction').inputValue(),'I predict 73 after the edit');
  await verified.locator('#earlier-prediction summary').click();
  assert.equal(await verified.locator('#legacy-answer').inputValue(),'Expect 42');
  console.log('A one-case legacy answer reopened under its matching question. Replacing it left the original accessible in a fresh tab.');
}finally{for(const f of clean)await f();await rm(dir,{recursive:true,force:true});}
