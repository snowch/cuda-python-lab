import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {launchChromium,serveBuild} from '../../../../tests/browser-support.mjs';
import {standaloneProgram} from '../../../../src/host-program.mjs';
import {lessons} from '../../../../src/course.mjs';
const dir=process.env.CAPTURE_DIR||'test-results/guide-review',clean=[];
const t={after:f=>clean.unshift(f),diagnostic:console.log};
await mkdir(dir,{recursive:true});
try {
 const url=await serveBuild(t),browser=await launchChromium(t),c=await browser.newContext();
 await c.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 const a=await c.newPage(),b=await c.newPage();
 const editor=p=>p.getByRole('textbox',{name:'Python program source'});
 const saved=p=>p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 async function type(p,s){await editor(p).press('Control+a');await p.keyboard.insertText(s);await saved(p);}
 async function capture(name){
  for(const width of [390,820,1440])for(const theme of ['light','dark']){
   await a.setViewportSize({width,height:900});await a.emulateMedia({colorScheme:theme});
   await a.waitForFunction(v=>document.documentElement.dataset.theme===v,theme);
   await a.locator('#setup-status').evaluate(el=>el.scrollIntoView({block:'center'}));
   assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await a.screenshot({path:dir+'/'+name+'-'+width+'-'+theme+'.png'});
  }
 }
 const k=await readFile(new URL('../../../../src/kernels/softmax.py',import.meta.url),'utf8');
 const [first,second]=lessons.softmax.cases.map(f=>standaloneProgram(k,f));
 for(const p of [a,b]){await p.goto(url+'#lesson/softmax');await editor(p).waitFor();}
 await type(a,first.replaceAll(' - row_max)',' )'));await a.locator('#guided-task').selectOption('lane');
 await type(a,second.replace('# Host code','# independently owned program'));
 await a.locator('#prepare-task').click();await a.locator('#prepare-task').waitFor({state:'hidden'});await saved(a);
 await type(b,'# new remote kernel\n'+first);
 await a.locator('#latest-version summary').click();await a.locator('[data-load]').click();
 await a.locator('#setup-status').filter({hasText:'shared kernel changed since preparation'}).waitFor();
 await capture('undo-scope'); console.log('Cross-case undo:',await a.locator('#setup-status').innerText());
 for(const [lesson,id,from,to] of [['vector-add','narrow','kernel[2, 32]','kernel[3, 16]'],['grid-stride','eight','kernel[2, 8]','kernel[2, 4]']]){
  await a.goto(url+'#lesson/'+lesson);await a.locator('#guided-task').selectOption(id);
  const kernel=await readFile(new URL('../../../../src/kernels/'+lesson+'.py',import.meta.url),'utf8');
  const program=standaloneProgram(kernel,lessons[lesson].cases[0]).replace(from,to);
  await type(a,program);await a.locator('#run').click();await a.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  assert.ok(await a.getByRole('combobox',{name:'Starter case',exact:true}).isVisible());
  assert.match(await a.locator('#prediction-label').innerText(),/Starter case/);
  assert.ok(await a.getByRole('heading',{name:'Explain the authored examples'}).count());
  console.log(lesson,await a.locator('#task-evidence').innerText(),await a.locator('#prediction-label').innerText(),await a.locator('#run-output').innerText());
  if(lesson==='vector-add')await capture('edited-launch');
 }
}finally{for(const f of clean)await f();}
