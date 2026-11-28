// Replay the authored instructions in a real browser. Audit edit pairs are the independent source oracle.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {lessons} from '../../../src/course.mjs';
import {guides,caseQuestion} from '../../../src/guided-experiments.mjs';
import {standaloneProgram} from '../../../src/host-program.mjs';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const evidence=new URL(process.env.GUIDE_EVIDENCE || './',import.meta.url);
await mkdir(evidence,{recursive:true});
const audit=(await readFile(new URL('../../course-audit/evidence/steps-final.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);
const hash=s=>createHash('sha256').update(s).digest('hex');
const checks=[],clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
const labels={
  'first-value/copy':'cuda.to_device(out_host) copies the CPU array; the GPU write changes the device allocation.',
  'vector-add/owner':'Index 32 is Block 1, Thread 0. The other 31 lanes in that block skip the write.',
  'grid-stride/overlap':'Thread 3 in Blocks 0 and 1 starts at 3 and 7. With stride 4 both visit 7, 11, …, 31.',
  'transfers/traffic':'Two float32 reads and one write per active thread request 396 bytes for 33 threads. The three explicit copies also sum to 396 bytes.',
  'coalescing/sectors':'Threads (0,0)/(7,0) read words 0/7 and write 0/56. Aligned sectors are 0/0 and 0/7.',
  'reduction/pair':'In Block 0 lanes 1 and 5 load values 2 and 6. Lane 1 reads both after the load barrier.',
  'scan/lane':'At distances 1, 2 and 4, lane 6 reads lanes 5, 4 and 2.',
  'matmul/zero':'In the second pass inner indices 6 and 7 are out of range; tile_a[0,2] and [0,3] receive zero.',
  'gather/adjacent-sectors':'Contiguous indices 0…7 all map to aligned sector 0.',
  'gather/spaced-sectors':'Indices 0,8,…,56 map to eight aligned sectors, 0…7.',
  'stencil/loads':'Sixteen center values and two valid inter-block halos. Block 1 stages input[7] in its own tile[0].',
  'sync-debug/barrier':'Block 1 lane 3 would skip the write of slot[3] and the barrier. Lane 2 consumes that slot. No invalid kernel was executed.',
};
// Audit rows are 1-based experiment executions, not authored instruction numbers.
const auditRuns={
 'first-value':{run:[1],write:[2],host:[3]},'vector-add':{launch:[4],narrow:[5]},
 'grid-stride':{visits:[6],eight:[7]},transfers:{bytes:[8,9],short:[10,11]},
 coalescing:{column:[12,13],edge:[14]},divergence:{negative:[15],count:[16],group:[17,18]},
 reduction:{partials:[19],tail:[20]},histogram:{balanced:[21],hot:[22],race:[23,24,25,26],restore:[27]},
 scan:{destination:[28],weights:[29]},'tiled-transpose':{coordinate:[30,31],padding:[32],edges:[34]},
 matmul:{passes:[35],reuse:[36]},softmax:{sums:[37,38],overflow:[39],lane:[41]},
 gather:{adjacent:[42],spaced:[43],direct:[44]},stencil:{reads:[45],compare:[46],omit:[47],tail:[49]},
 precision:{round:[50],regroup:[51],small:[53]},'sync-debug':{full:[54],partial:[55],sentinel:[56]},
 fusion:{store:[57],keep:[58],bypass:[59,60]},
};
// Source prerequisites from the original course ledger, including case-local host edits.
const prerequisiteRows={host:[2],overlap:[7],traffic:[9],sectors:[13],padding:[31],overflow:[38],restore:[23],barrier:[56]};
function applyRow(source,n) {
  const action=audit[n-1].action;
  if(!Array.isArray(action))return source;
  for(let i=0;i<action.length;i+=2) {
    assert.ok(source.includes(action[i]),'audit anchor '+action[i]);
    // The original audit used an extra blank before the closing parenthesis.
    source=source.replaceAll(action[i],action[i+1]===' )'?')':action[i+1]);
  }
  return source;
}
function values(output) {return JSON.parse(output.split('\n')[0].split(' = ')[1].replace(/\bnan\b/g,'null')).flat(Infinity);}
function close(a,b) {
 assert.equal(a.length,b.length);
 for(let i=0;i<a.length;i++) if(a[i]===null||b[i]===null)assert.equal(a[i],b[i]);
 else assert.ok(Math.abs(a[i]-b[i])<=1e-6+Math.abs(b[i])*1e-5, 'numeric mismatch at '+i);
}
try{
 const base=await serveBuild(t),browser=await launchChromium(t),page=await browser.newPage();
 await page.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 const editor=page.getByRole('textbox',{name:'Python program source'});
 async function download(button) {
   const d=page.waitForEvent('download');await page.locator(button).click();return readFile(await (await d).path(),'utf8');
 }
 async function source(){await page.locator('#editor-tools').evaluate(el=>el.open=true);return download('#download-source');}
 async function replace(text){await editor.press('Control+a');await page.keyboard.insertText(text);}
 async function run(expected,fixture,slug,task,auditRow){
   assert.equal(await source(),expected);
   await page.locator('#run').click();await page.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
   const output=await page.locator('#run-output').innerText(), actual=values(output);
   if(task==='race'){assert.equal(actual.length,4);assert.ok(actual[2]>=1 && actual[2]<=32);assert.deepEqual([actual[0],actual[1],actual[3]],[0,0,0]);}
   else if(auditRow){const ref=audit[auditRow-1];assert.equal(ref.fixture,fixture.label);close(actual,values(ref.output));assert.equal(output.split('\n').slice(1).join('\n'),ref.output.split('\n').slice(1).join('\n'));}
   else close(actual,fixture.expected);
   await page.waitForFunction(({slug,id,expected})=>Object.values(JSON.parse(localStorage.getItem('cuda-python-lab-v1')).results[slug]).some(r=>r.source===expected && r.caseId===id),{slug,id:fixture.id,expected});
   return {auditRow,sourceSha256:hash(expected),status:'Ran in GPGPU-Sim.',output};
 }
 for(const [slug,l] of Object.entries(lessons)){
   await page.goto(base+'#lesson/'+slug);await editor.waitFor();
   const kernel=await readFile(new URL('../../../src/kernels/'+slug+'.py',import.meta.url),'utf8');
   const tasks=guides[slug];assert.equal(new Set(tasks.map(t=>t.step)).size,l.exercise.length);
   for(const [i,fixture] of l.cases.entries()){
     if(l.cases.length>1)await page.locator('#case').selectOption(String(i));
     assert.equal(await page.locator('#prediction-prompt').innerText(),caseQuestion(slug,l,fixture));
     const starter=standaloneProgram(kernel,fixture);
     const r=await run(starter,fixture,slug,'pristine');
     checks.push({slug,fixture:fixture.id,task:'pristine',...r});
   }
   for(const task of tasks){
     await page.locator('#guided-task').selectOption(task.id);
     const index=l.cases.findIndex(c=>c.id===task.fixture),fixture=l.cases[index];
     assert.equal(await page.locator('#case').inputValue(),String(index));
     const starter=standaloneProgram(kernel,fixture);
     let intended=(prerequisiteRows[task.id]??[]).reduce(applyRow,starter);
     const before=await source();
     if(before!==intended){
       await page.locator('#prepare-task').click();await page.waitForFunction(()=>document.querySelector('#prepare-task').hidden);
     }
     assert.equal(await source(),intended);
     const action=await page.locator('#task-action').innerText();
     const record={slug,step:task.step,task:task.id,fixture:fixture.id,action,evidence:task.evidence,startingSource:hash(intended),prepared:before!==intended,runs:[]};
     if(task.kind==='reason'){
       record.reasoning=labels[slug+'/'+task.id];assert.ok(record.reasoning);
       await page.locator('#task-line').click();assert.ok(await editor.evaluate(el=>el===document.activeElement));
     }else{
       for(const n of auditRuns[slug][task.id]){
         const oracle=audit[n-1];
         assert.equal(oracle.slug,slug);
         if(oracle.action==='restore') {intended=starter;await replace(intended);}
         if(Array.isArray(oracle.action)){intended=applyRow(intended,n);await replace(intended);}
         record.runs.push(await run(intended,fixture,slug,task.id,n));
       }
       const notebook=JSON.parse(await download('#download-notebook'));
       assert.ok(notebook.cells.some(c=>c.metadata.cuda_lab?.task==='exported' && c.source===`%%experiment ${slug} ${fixture.id} exported\n`+intended));
       assert.ok(notebook.cells[0].source.includes(await page.locator('#prediction-prompt').innerText()));
     }
     checks.push(record); console.log(slug,task.step,task.id,record.reasoning??record.runs.map(r=>r.auditRow).join(','));
   }
 }
 assert.equal(checks.filter(c=>c.task==='pristine').length,38);
 assert.equal(new Set(checks.filter(c=>c.step).map(c=>c.slug+'/'+c.step)).size,51);
 console.log('All 38 pristine cases and 51 authored instructions verified.');
} finally {
 await writeFile(new URL('guided-runs.jsonl',evidence),checks.map(c=>JSON.stringify(c)).join('\n')+'\n');
 for(const f of clean)await f();
}
