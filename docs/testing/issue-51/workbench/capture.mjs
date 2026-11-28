// Photograph a real saved and executed lesson, keeping identical data in the two builds.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium, reviewPreparation, serveBuild} from '../../../../tests/browser-support.mjs';

const [build,out] = process.argv.slice(2);
const cleanup = [], events = [], frames = [];
const test = {after: f => cleanup.unshift(f), diagnostic: console.log};
const sizes = [[390,844],[768,1024],[820,1180],[900,1200],[1024,1366],[1024,768],[1440,960]];
const notes = {
  'first-value':'With a store of 73 and an original host zero, I expect the copied result to be 73. The original CPU array should still contain zero.',
  'vector-add':'I expect the last entry to stay at zero with one block of 32 threads. I will check whether element 32 has an owner before interpreting that zero.',
  softmax:'With the maximum shift, the largest exponential is one and columns 0 and 2 tie. After removing the shift from both calls, I expect overflow for a logit of 1000 and a False finiteness flag.'
};
await mkdir(out,{recursive:true});
try {
  const url=await serveBuild(test,{directory:pathToFileURL(resolve(build)+'/')});
  const browser=await launchChromium(test);
  const context=await browser.newContext({reducedMotion:'reduce', hasTouch:true});
  await context.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
  for(const lesson of Object.keys(notes)) {
    const page=await context.newPage(), id=s=>page.locator('#'+s);
    await page.goto(url+'#lesson/'+lesson);
    await id('source').locator('.cm-content').waitFor();
    await page.waitForFunction(()=>document.querySelector('#guided-task')?.options.length>1);
    const tasks=await id('guided-task').locator('option').evaluateAll(os=>os.map(o=>o.value));
    const task=lesson==='first-value'?'write':lesson==='vector-add'?'launch':'overflow';
    assert.ok(tasks.includes(task));await id('guided-task').selectOption(task);
    if(!await id('prepare-task').evaluate(button=>button.hidden)){
      if(await id('program-options').count())await reviewPreparation(page);
      await id('prepare-task').click();
      if(await id('program-options').count())await id('program-options').locator('summary').click();
    }
    await id('editor-tools').evaluate(e=>e.open=true);
    const [download]=await Promise.all([page.waitForEvent('download'),id('download-source').click()]);
    const initial=await readFile(await download.path(),'utf8');
    const source=lesson==='first-value'?initial.replace('out[0] = 42','out[0] = 73'):
      lesson==='vector-add'?initial.replace('kernel[2, 32]','kernel[1, 32]'):
      initial.replaceAll('math.exp(values[row, col] - row_max)','math.exp(values[row, col])')
        .replace('    return result','    print(np.isfinite(result).all())\n    return result');
    assert.notEqual(source,initial);
    await id('editor-tools').evaluate(e=>e.open=false);
    const editor=page.getByRole('textbox',{name:'Python program source'});
    await editor.press('Control+a');await page.keyboard.insertText(source);await id('prediction').fill(notes[lesson]);
    await id('work-status').filter({hasText:'Learner work saved'}).waitFor();
    await id('run').click();
    await id('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
    if(lesson==='first-value')await id('trace-step').selectOption('6');
    if(lesson==='vector-add')await id('map-step').selectOption('3');
    await editor.press('Control+Home');await editor.press('Escape');await page.keyboard.press('Tab');
    if(lesson==='softmax')assert.match(await id('run-output').innerText(),/False/);
    events.push({lesson,task,source,prediction:notes[lesson],action:await id('task-action').innerText(),stdout:await id('run-output').innerText()});
    async function shot(name,target,fullPage=false){
      if(target)await target.evaluate(e=>e.scrollIntoView({block:'center'}));
      else await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:join(out,name+'.jpg'),type:'jpeg',quality:58,fullPage});
    }
    for(const [width,height] of sizes)for(const theme of ['light','dark']){
      await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme});
      await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
      const key=lesson+'-'+width+'x'+height+'-'+theme;
      await shot(key+'-page',null,true);
      await shot(key+'-task',id('task-action'));
      await shot(key+'-edit',id('source'));
      await shot(key+'-result',id('run-output'));
      const rect=await page.evaluate(()=>{
        const width=s=>Math.round(document.querySelector(s).getBoundingClientRect().width);
        const top=s=>Math.round(document.querySelector(s).getBoundingClientRect().top+scrollY);
        return {overflow:document.documentElement.scrollWidth-innerWidth,editor:width('.cm-scroller'),task:width('#task-action'),prediction:width('#prediction'),console:width('.run-console'),editorTop:top('#source'),modelTop:document.querySelector('.value-trace')?top('.value-trace'):null};
      });
      assert.equal(rect.overflow,0);frames.push({lesson,width,height,theme,...rect});
    }
    if(lesson==='softmax'){
      await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='cuda-python-lab-v1')throw new DOMException('Test quota','QuotaExceededError');return orig.call(this,k,v);};window.resumeSave=()=>Storage.prototype.setItem=orig;});
      await id('prediction').fill(notes.softmax+' Preserve this unsaved observation.');
      await id('work-status').filter({hasText:'could not be saved'}).waitFor();
      for(const [width,height] of sizes)for(const theme of ['light','dark']){
        await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme});
        await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
        await shot('softmax-'+width+'x'+height+'-'+theme+'-recovery',id('work-recovery-link'));
      }
      await id('work-recovery-link').click();assert.equal(await page.locator(':focus').getAttribute('id'),'work-status');
      await page.evaluate(()=>resumeSave());await id('retry-save').click();await id('work-status').filter({hasText:'Learner work saved'}).waitFor();
    }
    await page.close();
  }
} finally {
  await writeFile(join(out,'observations.json'),JSON.stringify({events,frames},null,1)+'\n');
  for(const close of cleanup)await close();
}
