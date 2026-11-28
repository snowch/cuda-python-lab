import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
import {standaloneProgram} from '../../../src/host-program.mjs';
import {lessons} from '../../../src/course.mjs';
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
try {
  const url=await serveBuild(t),browser=await launchChromium(t),p=await browser.newPage();
  await p.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
  await p.goto(url+'#lesson/precision');
  const editor=p.getByRole('textbox',{name:'Python program source'}),run=p.locator('#run-status'),out=p.locator('#run-output');
  const fixture=lessons.precision.cases[1],kernel=await readFile(new URL('../../../src/kernels/precision.py',import.meta.url),'utf8');
  const starter=standaloneProgram(kernel,fixture);
  await p.locator('#guided-task').selectOption('small');
  const edited=starter.replace('a[i] + b[i]','a[i] + c[i]').replace('first + c[i]','first + b[i]');
  async function replace(value){await editor.press('Control+a');await p.keyboard.insertText(value);}
  async function saved(){await p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();}
  async function execute(){await p.locator('#run').click();await run.filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});await saved();}
  await replace(edited);await saved();await execute();
  const equalOutputs=await out.innerText();assert.equal(equalOutputs,'out = [1.0, 1.0]');
  await p.locator('#prepare-task').click();await p.locator('#prepare-task').waitFor({state:'hidden'});await saved();
  assert.match(await run.innerText(),/Previous run shown/);assert.equal(await out.innerText(),equalOutputs);
  await p.reload();await editor.waitFor();assert.match(await run.innerText(),/Previous run shown/);
  await p.locator('#undo-prepare').click();await p.locator('#prepare-task').waitFor();await saved();assert.equal(await run.innerText(),'Ran in GPGPU-Sim.');
  await p.locator('#prepare-task').click();await p.locator('#prepare-task').waitFor({state:'hidden'});await saved();await execute();
  await replace(starter+'# an ordinary edit\n');await saved();
  assert.match(await run.innerText(),/Previous run shown/);assert.equal(await out.innerText(),equalOutputs);
  const durable=await p.evaluate(()=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).results.precision[1]);
  assert.equal(durable.source,starter);assert.equal(durable.caseId,fixture.id);
  await p.locator('#case').selectOption('0');assert.equal(await out.innerText(),'');
  console.log('Precision / small: edited and starter runs both printed',equalOutputs);
  console.log('Preparing the starter marked the edited output as previous. Reload kept the warning. Undo restored its exact source and run status. A new starter run saved the small case ID and its exact source. An ordinary edit marked that run previous; the other case showed no result.');
}finally{for(const f of clean)await f();}
