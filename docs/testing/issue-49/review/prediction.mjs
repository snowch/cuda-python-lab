// Exercise the trace-to-prediction handoff in the reviewed build and its correction.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../../tests/browser-support.mjs';
import {workKey} from '../../../../src/learner-work.mjs';
import {lessons} from '../../../../src/course.mjs';

const [build,out,version]=process.argv.slice(2);
const after=version==='after', slug='first-value';
const legacy='Earlier lesson answer: I expected a copy.', prior='Earlier case answer: I predicted the original would stay unchanged.';
const starterNote='Host 0, store 42, print result only. I predict out_host [0], out [42], result [42].';
const editedNote='Host 5, store 73, print result then original. I predict out_host [5], out [73], result [73].';
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log}, observations=[];
await mkdir(out,{recursive:true});
try{
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}),browser=await launchChromium(t);
 const page=await browser.newPage({viewport:{width:390,height:850},reducedMotion:'reduce'});
 await page.addInitScript(({workKey,legacy,prior})=>{
  localStorage.setItem('cuda-python-lab:code-runner-intro:3','1');
  if(!localStorage.getItem(workKey))localStorage.setItem(workKey,JSON.stringify({predictions:{'first-value':legacy},caseAnswers:{'first-value':{one:prior}}}));
 },{workKey,legacy,prior});
 await page.goto(url+'#lesson/first-value');
 const el=id=>page.locator('#'+id), saved=()=>el('work-status').filter({hasText:'Learner work saved'}).waitFor();
 const source=async()=>{
  await el('editor-tools').evaluate(n=>n.open=true);
  const [file]=await Promise.all([page.waitForEvent('download'),el('download-source').click()]);
  await el('editor-tools').evaluate(n=>n.open=false);
  return readFile(await file.path(),'utf8');
 };
 async function inspect(label,host,store,prints,note) {
  await el('trace-predict').press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('id'),'prediction');
  const question=await el('prediction-prompt').innerText();
  const actual=await el('prediction').inputValue();
  assert.equal(actual,note);
  const row={label,host,store,prints,question,note:actual};
  if(after){
   assert.ok(question.includes('host starts at '+host) && question.includes('kernel stores '+store));
   assert.match(question,/out_host.*out.*result/);
   assert.equal(await el('comparison-question').innerText(),question);
   row.evidence=await el('prediction-evidence').innerText();
   assert.match(row.evidence,prints?/prints result, then out_host/:/prints only result/);
   assert.match(row.evidence,/device value/);
   assert.equal(await el('comparison-evidence').innerText(),row.evidence);
   assert.match(await el('brief-prediction').innerText(),/earlier runs/);
   assert.ok((await el('brief-prediction').innerText()).endsWith(note));
  }
  observations.push(row);
 }
 async function run(expected) {
  await el('run').press('Enter');
  await el('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  assert.equal(await el('run-output').innerText(),expected);
  assert.match(await el('trace-evidence').innerText(),/for this program/);
 }
 async function shot(name,target,width,theme){
  await page.setViewportSize({width,height:850});await page.emulateMedia({colorScheme:theme});
  await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
  await target.evaluate(n=>n.scrollIntoView({block:'center'}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(out,name+'.jpg'),type:'jpeg',quality:78});
 }
 await el('trace-step').waitFor();await inspect('starter before execution',0,42,false,prior);
 const starter=await source();assert.match(starter,/np.zeros\(1,/);assert.match(starter,/out\[0\] = 42/);
 if(after){
  await el('prediction').fill(prior+'\n'+starterNote);await saved();
  await run('out = [42.0]');observations.push({starterStdout:await el('run-output').innerText()});
 }
 await el('trace-inputs').evaluate(n=>n.open=true);
 await el('trace-host').selectOption('5');await el('trace-store').selectOption('73');await el('trace-print').selectOption('both');
 assert.equal(await source(),starter);
 await inspect('unapplied preview',0,42,false,after?prior+'\n'+starterNote:prior);
 await el('trace-apply').click();await el('trace-identity').filter({hasText:'host 5 · store 73'}).waitFor();await saved();
 await inspect('applied edit before execution',5,73,true,after?prior+'\n'+starterNote:prior);
 await shot('edited-prompt-phone',el('prediction'),390,'light');
 if(!after){
  assert.match(await el('prediction-prompt').innerText(),/starts with \[0.0\]/);
  observations.push({traceQuestion:await el('trace-narrative').innerText(),identity:await el('trace-identity').innerText()});
 } else {
  assert.match(await el('trace-evidence').innerText(),/earlier program/);
  const edited=await source();assert.match(edited,/np.array\(\[5\]/);assert.match(edited,/out\[0\] = 73/);assert.match(edited,/print\(out_host.tolist\(\)\)/);
  const notes=[prior,starterNote,editedNote].join('\n');
  await el('prediction').fill(notes);await saved();
  await run('out = [73.0]\n[5.0]');observations.push({editedStdout:await el('run-output').innerText()});
  await shot('comparison-phone',el('comparison-question'),390,'light');
  await shot('comparison-desktop',el('comparison-question'),1440,'dark');
  await el('undo-prepare').click();await el('trace-identity').filter({hasText:'host 0 · store 42'}).waitFor();await saved();
  await inspect('undo',0,42,false,notes);assert.equal(await source(),starter);
  await page.reload();await el('trace-step').waitFor();await inspect('reload after undo',0,42,false,notes);
  await el('earlier-prediction summary').click();assert.equal(await el('legacy-answer').inputValue(),legacy);
  await el('undo-prepare').click();await el('trace-identity').filter({hasText:'host 5 · store 73'}).waitFor();await saved();
  const editor=page.getByRole('textbox',{name:'Python program source'});
  await editor.press('Control+a');await page.keyboard.insertText(edited.replace('out[0] = 73','out[0] = 91'));await saved();
  await el('trace-unavailable').waitFor();
  const q=await el('prediction-prompt').innerText();
  assert.equal(await el('comparison-question').innerText(),q);assert.match(q,/open program to print/);assert.doesNotMatch(q,/73|42/);
  assert.equal(await el('prediction').inputValue(),notes);
  await el('run').press('Enter');await el('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  assert.equal(await el('run-output').innerText(),'out = [91.0]\n[5.0]');
  await shot('custom-comparison',el('comparison-question'),320,'dark');
  observations.push({customQuestion:q,actual:await el('run-output').innerText(),notes});
  const [file]=await Promise.all([page.waitForEvent('download'),el('download-notebook').click()]);
  const nb=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.ok(nb.cells[0].source.includes(lessons[slug].predict));assert.ok(nb.cells.some(c=>c.source.includes('out[0] = 91')));
  observations.push({nativeQuestion:lessons[slug].predict});
 }
}finally{
 await writeFile(join(out,'observations.json'),JSON.stringify(observations,null,2)+'\n');
 for(const f of clean)await f();
}
