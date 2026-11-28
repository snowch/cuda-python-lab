// Replay real browser programs; expected data and source edits below are independent of the trace.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
import {lessons} from '../../../src/course.mjs';
import {standaloneProgram} from '../../../src/host-program.mjs';
import {workKey} from '../../../src/learner-work.mjs';

const [build,out]=process.argv.slice(2);
await mkdir(join(out,'programs'),{recursive:true});
const clean=[], t={after:f=>clean.unshift(f),diagnostic:console.log};
const starter=standaloneProgram(await readFile(new URL('../../../src/kernels/first-value.py',import.meta.url),'utf8'),lessons['first-value'].cases[0]);
function reference(host,store,printed) {
 let source=starter.replace('out[0] = 42','out[0] = '+store);
 if(host===5)source=source.replace('np.zeros(1, dtype=np.float32)','np.array([5], dtype=np.float32)');
 return printed?source.replace('    return result','    print(out_host.tolist())\n    return result'):source;
}
const hash=s=>createHash('sha256').update(s).digest('hex');
const runs=[], interaction=[];
try{
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}), browser=await launchChromium(t);
 const context=await browser.newContext({viewport:{width:390,height:850},hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 const page=await context.newPage(), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'#lesson/first-value');
 const field=id=>page.locator('#'+id);
 const editor=page.getByRole('textbox',{name:'Python program source'});
 const saved=()=>field('work-status').filter({hasText:'Learner work saved'}).waitFor();
 async function source() {
  const tools=field('editor-tools');await tools.evaluate(el=>el.open=true);
  const [d]=await Promise.all([page.waitForEvent('download'),field('download-source').click()]);
  const text=await readFile(await d.path(),'utf8');await tools.evaluate(el=>el.open=false);
  return text;
 }
 async function run(host,store,printed,label){
  const expected=reference(host,store,printed);
  assert.equal(await source(),expected);
  await writeFile(join(out,'programs',`host-${host}-store-${store}-${printed?'both':'result'}.py`),expected);
  await field('run').press('Enter');
  await field('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  const output=await field('run-output').textContent();
  assert.equal(output,'out = ['+store+'.0]'+(printed?'\n['+host+'.0]':''));
  const row=await page.waitForFunction(({key,expected})=>{
    const r=JSON.parse(localStorage.getItem(key)).results?.['first-value']?.[0];
    return r?.source===expected && r?.caseId==='one'?r:null;
  },{key:workKey,expected});
  const actual=await row.jsonValue();assert.equal(actual.output,output);
  assert.ok(actual.ptx.includes('.entry'));
  assert.ok((await field('trace-evidence').textContent()).endsWith(output));
  await field('trace-step').selectOption('7');
  assert.deepEqual(await page.locator('[data-value]').allTextContents(),['['+host+']','['+store+']','['+store+']']);
  runs.push({label,fixture:actual.caseId,sourceSha256:hash(expected),ptxSha256:hash(actual.ptx),host,store,printed,observedStdout:output,modeledFinal:[host,store,store]});
 }
 async function patch(host,store,printed){
  await field('trace-inputs').evaluate(el=>el.open=true);
  await field('trace-host').selectOption(String(host));await field('trace-store').selectOption(String(store));
  await field('trace-print').selectOption(printed?'both':'result');
  await field('trace-apply').click();
  await field('trace-diff').filter({hasText:'The controls match the open program.'}).waitFor();
  await saved();
  assert.equal(await source(),reference(host,store,printed));
 }
 async function captures(name,anchor){
  for(const width of [320,390,820,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:850});await page.emulateMedia({colorScheme:theme});
   await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
   await anchor.evaluate(el=>el.scrollIntoView({block:'center'}));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:join(out,name+'-'+width+'-'+theme+'.jpg'),type:'jpeg',quality:76});
  }
  await page.setViewportSize({width:390,height:850});
 }
 await editor.waitFor();
 await run(0,42,false,'unmodified one-element starter');
 await field('trace-predict').tap();await page.keyboard.type('The original stays at 5 when the thread stores 73.');
 await saved();
 const stageEvidence = [];
 const expectedStages = [[null,null,null],[0,null,null],[0,0,null],[0,0,null],[0,0,null],[0,42,null],[0,42,42],[0,42,42]];
 for (const [index,expected] of expectedStages.entries()) {
  await field('trace-step').selectOption(String(index));
  const values=await page.locator('[data-value]').allTextContents();
  assert.deepEqual(values,expected.map(value=>value===null?'Not created':'['+value+']'));
  const alternatives=[];
  for(const [buffer,value] of expected.entries()){
   await page.locator('[data-buffer="'+buffer+'"]').tap();
   const description=await field('trace-inspection').innerText();
   assert.ok(description.includes(value===null?'does not exist':'index 0 is '+value+'.'));
   alternatives.push(description);
  }
  stageEvidence.push({step:index+1,narrative:await field('trace-narrative').innerText(),source:await field('trace-line').innerText(),values,alternatives});
 }
 await writeFile(join(out,'text-equivalents.json'),JSON.stringify(stageEvidence,null,2));
 await page.locator('[data-restart]').press('Enter');
 assert.equal(await field('trace-step').inputValue(),'0');
 for(const [host,store] of [[0,73],[5,42],[5,73]]){
  await patch(host,store,false);
  await run(host,store,false,'supported edit printing the copied result');
 }
 for(const [host,store] of [[0,42],[0,73],[5,42],[5,73]]){
  await patch(host,store,true);
  assert.match(await field('trace-evidence').textContent(),/earlier program/);
  await run(host,store,true,'supported edit with original printed');
 }
 await field('trace-inputs').evaluate(el=>el.open=false);
 await field('trace-step').selectOption('5');
 await page.locator('[data-buffer="1"]').tap();
 assert.match(await field('trace-inspection').innerText(),/index 0 is 73/);
 assert.equal(await page.locator('[data-buffer="1"] [data-role]').innerText(),'Written');
 await captures('trace',field('trace-narrative'));
 await field('guided-task').selectOption('host');
 await captures('result',field('run-output'));
 await field('prepare-task').click();await saved();
 assert.equal(await source(),reference(0,73,false));
 await captures('prepare-undo',field('setup-status'));
 await field('undo-prepare').click();await saved();
 assert.equal(await source(),reference(5,73,true));
 // Reload, review source/case provenance, then exercise a truly unsupported program.
 await page.reload();await editor.waitFor();
 assert.ok((await field('trace-evidence').textContent()).includes('[5.0]'));
 const custom=starter.replace('out[0] = 42','out[0] = 91');
 await editor.press('Control+a');await page.keyboard.insertText(custom);await saved();
 await field('trace-unavailable').waitFor();assert.equal(await source(),custom);
 await field('run').click();await field('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
 assert.equal(await field('run-output').innerText(),'out = [91.0]');
 assert.match(await field('trace-evidence').innerText(),/custom program/);
 interaction.push({customSourceSha256:hash(custom),stdout:await field('run-output').innerText(),scope:await field('trace-evidence').innerText()});
 await editor.press('Control+a');await page.keyboard.insertText(starter.replace('out[0] = 42','out[0] ='));
 await field('trace-unavailable').waitFor();await saved();
 await field('run').click();await field('run-status').filter({hasText:'Execution stopped with an error'}).waitFor({timeout:90000});
 assert.match(await field('trace-evidence').textContent(),/failed/);
 interaction.push({malformedStatus:await field('run-status').innerText(),diagnostic:await field('run-output').innerText()});
 await captures('execution-error',field('run-output'));
 await editor.press('Control+a');await page.keyboard.insertText(reference(5,73,true));await saved();
 assert.match(await field('trace-evidence').textContent(),/earlier program/);
 await run(5,73,true,'after actual compile error and source restoration');
 // Simulate denied persistence, with genuine UI retry and .json backup.
 await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('Test quota','QuotaExceededError');return original.call(this,k,v);};window.restoreWrites=()=>Storage.prototype.setItem=original;},workKey);
 await field('prediction').fill('Preserve this prediction through retry.');
 await field('work-status').filter({hasText:'could not be saved'}).waitFor();
 await field('work-recovery-link').press('Enter');
 assert.equal(await page.locator(':focus').getAttribute('id'),'work-status');
 await captures('save-recovery',field('work-actions'));
 const [backup]=await Promise.all([page.waitForEvent('download'),field('export-work').click()]);
 const record=JSON.parse(await readFile(await backup.path(),'utf8'));
 assert.equal(record.openLesson.program,reference(5,73,true));assert.equal(record.openLesson.prediction,'Preserve this prediction through retry.');
 await page.evaluate(()=>window.restoreWrites());await field('retry-save').press('Enter');await saved();
 // Offline download, reload and launch a different supported edit without a network.
 await field('app-status-open').click();
 await field('app-status-details').evaluate(el=>el.open=true);
 await field('download-update').filter({hasText:'Save offline copy'}).click();
 await field('version-status').filter({hasText:'Downloaded and ready to use offline'}).waitFor({timeout:90000});
 await field('app-status-close').click();await context.setOffline(true);
 await page.reload();await editor.waitFor();
 await patch(5,42,true);await run(5,42,true,'offline reload and new kernel execution');
 await field('walkthrough').locator('summary').first().click();
 const video=page.locator('video[data-walkthrough="first-value"]');
 const media=await video.evaluate(async el=>{
  el.muted=true; el.textTracks[0].mode='showing';
  await el.play();
  el.currentTime=60;
  await new Promise(resolve=>el.addEventListener('seeked',resolve,{once:true}));
  el.pause();
  return {duration:el.duration,currentTime:el.currentTime,readyState:el.readyState,activeCaption:el.textTracks[0].activeCues?.[0]?.text};
 });
 assert.match(media.activeCaption,/writes 42/);
 interaction.push({offlineRecording:media});
 assert.equal(await field('prediction').inputValue(),'Preserve this prediction through retry.');
 await page.goto(url+'#lesson/softmax');await field('case').selectOption('1');await field('guided-task').selectOption('overflow');
 assert.equal(await field('case').inputValue(),'0');
 assert.equal(await field('brief-action').textContent(),await field('task-action').textContent());
 await captures('long-task',field('task-brief'));
 await page.goto(url+'#lesson/first-value');await editor.waitFor();
 assert.equal(await source(),reference(5,42,true));
 assert.deepEqual(errors,[]);
 interaction.push({offline:true,errors,fixture:'one',sourceAfterNavigation:hash(await source())});
}finally{
 await writeFile(join(out,'runs.json'),JSON.stringify(runs,null,2));await writeFile(join(out,'interaction.json'),JSON.stringify(interaction,null,2));
 for(const f of clean)await f();
}
