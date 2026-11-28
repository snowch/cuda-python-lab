import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const [build,out,version]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log}, visits=[];
try {
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}), b=await launchChromium(t);
 const p=await b.newPage({viewport:{width:390,height:850},reducedMotion:'reduce'});
 await p.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 await p.goto(url+'#lesson/first-value');await p.locator('#run').waitFor();
 const key=k=>p.keyboard.press(k);
 async function focused(){return p.evaluate(()=>{const el=document.activeElement,r=el.getBoundingClientRect();return {id:el.id||el.getAttribute('aria-label')||el.closest('details')?.id||el.textContent?.trim().slice(0,45),scrollY,y:Math.round(r.y),height:Math.round(r.height)};});}
 async function reach(id,back=false){
  const steps=[];
  for(let i=0;i<110;i++){
   const state=await focused();if(state.id===id){visits.push({reach:id,steps,arrived:state});return;}
   if(state.id==='Python program source')await key('Escape');
   await key(back?'Shift+Tab':'Tab');steps.push((await focused()).id);
  }
  throw Error('Cannot reach '+id+' via keyboard: '+steps.join(' / '));
 }
 await reach('guided-task');await key('End');await key('Enter');
 assert.equal(await p.locator('#guided-task').inputValue(),'host');
 await reach('prepare-task');await key('Enter');await p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 await reach('run');await key('Enter');
 const focusAfterRun=await focused();visits.push({focusAfterRun});
 if(version==='after')assert.equal(focusAfterRun.id,'stop');
 await reach('stop');await key('Enter');
 await p.waitForFunction(()=>document.getElementById('stop').hidden);
 visits.push({focusAfterStop:await focused()});
 if(version==='after')assert.equal((await focused()).id,'run');
 await reach('prediction',true);await p.keyboard.type('Original 0, device 73, copied result 73.');
 await reach('task-line',true);await key('Enter');
 assert.equal(await p.evaluate(()=>getSelection().toString()),'return result');
 await p.keyboard.insertText('print(out_host.tolist())\n    return result');
 await reach('run');await key('Enter');
 await p.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
 assert.equal(await p.locator('#run-output').innerText(),'out = [73.0]\n[0.0]');
 // Measure the real PageUp count from the observed output until the complete edit is readable.
 await p.locator('#run-output').focus();await p.locator('#run-output').evaluate(el=>el.scrollIntoView({block:'end'}));
 const action=version==='after'?'brief-action':'task-action';
 const visible=()=>p.evaluate(id=>{const rect=document.getElementById(id).getBoundingClientRect(),h=document.querySelector('.site-header').getBoundingClientRect();return rect.top>=Math.max(0,h.bottom)&&rect.bottom<=innerHeight;},action);
 let pageUps=0;const origin=await p.evaluate(()=>scrollY);
 while(!(await visible()) && pageUps<8){await key('PageUp');await p.waitForTimeout(250);pageUps++;}
 visits.push({outputToEntireInstruction:{pageUps,visible:await visible(),origin,destination:await p.evaluate(()=>scrollY)}});
 assert.ok(await visible());
 await reach('task-console',true);await key('Enter');assert.equal((await focused()).id,'console-title');
 await reach('undo-prepare',true);await key('Enter');await p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 if(version==='after'){
  await reach('brief-trace');await key('Enter');assert.equal((await focused()).id,'trace-title');
  await reach('trace-step');await key('End');await key('Enter');
  assert.equal(await p.locator('#trace-step').inputValue(),'7');
  await reach('trace-line');await key('Enter');assert.equal(await p.evaluate(()=>getSelection().toString()),'return result');
  await key('Escape');await key('Tab');assert.equal((await focused()).id,'run');
  await p.screenshot({path:join(out,'keyboard-run-focus.png')});
  // Provoke a real failed persistence transaction, then navigate its recovery controls by key.
  await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='cuda-python-lab-v1')throw new DOMException('Injected quota','QuotaExceededError');return original.call(this,k,v);};window.fixStore=()=>Storage.prototype.setItem=original;});
  await reach('prediction',true);await p.keyboard.type(' Keep this edit.');
  await p.locator('#work-status').filter({hasText:'could not be saved'}).waitFor();
  await reach('work-recovery-link');await key('Enter');
  assert.equal((await focused()).id,'work-status');await reach('retry-save');await p.evaluate(()=>window.fixStore());await key('Enter');
  await p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 }
} finally {await writeFile(join(out,'keyboard.json'),JSON.stringify(visits,null,1));for(const f of clean)await f();}
