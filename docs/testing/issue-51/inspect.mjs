import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const [build,out,baseline]=process.argv.slice(2);
const cleanup=[],t={after:f=>cleanup.unshift(f),diagnostic:console.log},scans=[],events=[];
await mkdir(out,{recursive:true});
try{
 const base=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}),browser=await launchChromium(t);
 const context=await browser.newContext({viewport:{width:390,height:850},hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const id=s=>page.locator('#'+s);
 const saved=()=>id('work-status').filter({hasText:'Learner work saved'}).waitFor();
 async function frame(name,target,scan=false){
  for(const width of [320,390,820,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:850});await page.emulateMedia({colorScheme:theme});
   await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
   await target.evaluate(e=>e.scrollIntoView({block:'center'}));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.equal(overflow,0);
   let violations;
   if(scan && [320,820].includes(width)){
    await page.addScriptTag({path:process.env.AXE_PATH});
    violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});
   }
   scans.push({name,width,theme,overflow,violations});
   if(violations)assert.deepEqual(violations,[],name+' '+width+' '+theme);
   await page.screenshot({path:join(out,name+'-'+width+'-'+theme+'.jpg'),type:'jpeg',quality:71});
  }
  await page.setViewportSize({width:390,height:850});
 }
 for(const slug of ['course','lesson/first-value','lesson/vector-add','lesson/grid-stride']){
  await page.goto(base+'#'+slug);await page.locator('main h1').waitFor();
  const controls=await page.locator('main h1, main h2, .lesson-footer strong').allInnerTexts();
  events.push({route:slug,title:controls[0],headings:controls.slice(1)});
  if(baseline && slug==='lesson/vector-add')await frame('original',page.locator('.block-coverage'));
 }
 if(!baseline){
  await page.goto(base+'#lesson/vector-add');await id('map-body').waitFor();
  await id('brief-trace').tap();assert.equal(await page.locator(':focus').getAttribute('id'),'trace-title');
  const keyboard=[];
  async function tabTo(target,back=false) {
   for(let count=0;count<100;count++){
    if(await page.locator(':focus').getAttribute('id')===target){keyboard.push(target);return;}
    if(await page.locator(':focus').getAttribute('aria-label')==='Python program source')await page.keyboard.press('Escape');
    await page.keyboard.press(back?'Shift+Tab':'Tab');
   }
   throw Error('Unreachable control: '+target);
  }
  await tabTo('map-step');await page.keyboard.press('End');await page.keyboard.press('Enter');
  await tabTo('map-thread');await page.keyboard.press('ArrowDown');
  assert.match(await id('map-guard').innerText(),/33 < 33 is false/);
  await frame('skipped',id('map-guard'));
  await tabTo('map-element');await page.keyboard.press('End');await page.keyboard.press('Enter');
  assert.equal(await id('map-element').inputValue(),'32');assert.equal(await id('map-thread').inputValue(),'32');
  await frame('owner',id('map-equation'),true);
  await writeFile(join(out,'accessible-tree.txt'),await page.locator('.thread-map').ariaSnapshot());
  await tabTo('map-line');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>getSelection().toString()),'out[i] = a[i] + b[i]');
  await page.keyboard.press('Escape');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('id'),'run');
  await tabTo('brief-trace');await page.keyboard.press('Enter');await tabTo('map-predict');await page.keyboard.press('Enter');
  assert.equal(await page.locator(':focus').getAttribute('id'),'prediction');
  await page.keyboard.type('2 x 32, standard inputs, zero output: last value 99.');await saved();
  await tabTo('run');await page.keyboard.press('Enter');
  await id('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  events.push({keyboard,actualStarter:await id('run-output').innerText()});
  await id('map-inputs').locator('summary').tap();
  await id('map-launch').selectOption('1 × 32');await id('map-pair').selectOption('cancel');await id('map-initial').selectOption('-1');
  assert.match(await id('prediction-prompt').innerText(),/2 blocks × 32/);
  await frame('proposal',id('map-preview'),true);
  await id('map-apply').tap();await id('prediction-prompt').filter({hasText:'1 block × 32'}).waitFor();
  assert.match(await id('map-observed').innerText(),/earlier code/);await saved();
  await id('map-predict').press('Enter');await id('prediction').fill('1 x 32, opposite inputs, initial -1: element 32 stays -1.');await saved();
  await id('run').press('Enter');await id('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  await id('map-step').selectOption('3');await frame('uncovered',id('map-cells'));
  await frame('comparison',id('compare-prediction'));events.push({under:await id('map-observed').innerText(),note:await id('prediction').inputValue()});
  await id('map-launch').selectOption('2 × 32');await id('map-apply').tap();await id('prediction-prompt').filter({hasText:'2 blocks × 32'}).waitFor();
  await id('run').press('Enter');await id('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  await id('map-step').selectOption('3');await frame('repair',id('map-cells'));
  events.push({repair:await id('map-observed').innerText()});
  await id('map-undo').press('Enter');await id('undo-prepare').press('Enter');await id('prediction-prompt').filter({hasText:'1 block × 32'}).waitFor();
  await saved();await page.reload();await id('map-body').waitFor();
  assert.match(await id('prediction').inputValue(),/stays -1/);
  await id('map-undo').evaluate(e=>e.closest('details').open=true);await id('map-undo').press('Enter');
  const editor=page.getByRole('textbox',{name:'Python program source'});
  await id('editor-tools').evaluate(e=>e.open=true);
  const [download]=await Promise.all([page.waitForEvent('download'),id('download-source').click()]);
  const old=await readFile(await download.path(),'utf8');
  await editor.press('Control+a');await page.keyboard.insertText(old.replace('out[i] = a[i] + b[i]','out[i] ='));
  await id('map-unavailable').waitFor();await saved();await id('run').click();
  await id('run-status').filter({hasText:'Execution stopped with an error'}).waitFor({timeout:90000});
  assert.match(await id('run-output').innerText(),/SyntaxError/);
  events.push({malformed:await id('run-output').innerText(),prompt:await id('prediction-prompt').innerText()});
  await editor.press('Control+a');await page.keyboard.insertText(old.replace('out[i] = a[i] + b[i]','out[i] = a[i] - b[i]'));await saved();
  assert.match(await id('run-status').innerText(),/Previous run/);
  await id('run').click();await id('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
  assert.ok(await id('map-unavailable').isVisible());
  events.push({custom:await id('run-output').innerText(),prompt:await id('prediction-prompt').innerText()});
  await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='cuda-python-lab-v1')throw new DOMException('Test quota','QuotaExceededError');return set.call(this,k,v);};window.allowWrites=()=>Storage.prototype.setItem=set;});
  await id('prediction').fill('Export my open edited program and this unsaved note.');await id('work-status').filter({hasText:'could not be saved'}).waitFor();
  await id('work-recovery-link').press('Enter');const [file]=await Promise.all([page.waitForEvent('download'),id('export-work').click()]);
  const backup=JSON.parse(await readFile(await file.path(),'utf8'));assert.ok(backup.openLesson.program.includes('a[i] - b[i]'));
  assert.equal(backup.openLesson.prediction,await id('prediction').inputValue());
  await page.evaluate(()=>window.allowWrites());await id('retry-save').click();await saved();events.push({recovered:true,openAnswer:backup.openLesson.prediction});
 }
 assert.deepEqual(errors,[]);
}finally{
 await writeFile(join(out,'inspection.json'),JSON.stringify({scans,events},null,1)+'\n');
 for(const f of cleanup)await f();
}
