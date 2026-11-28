import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveBuild,launchChromium} from '../../../../tests/browser-support.mjs';
const [build,out,baseline]=process.argv.slice(2),events=[],caseChanges=[],clean=[];
const t={after:f=>clean.unshift(f),diagnostic:console.log};
await mkdir(out,{recursive:true});
try {
  const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')});
  const browser=await launchChromium(t);
  for(const lesson of ['first-value','vector-add'])for(const width of [320,390]){
    const ctx=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const page=await ctx.newPage();await page.goto(url+'#lesson/'+lesson);
    await page.locator('.cm-content').waitFor();const id=s=>page.locator('#'+s);
    const note='I will distinguish the values derived from the program from those printed by the simulator. '.repeat(13);
    await id('prediction').fill(note);
    for(const height of [844,410,340]){
      await page.setViewportSize({width,height});await id('console-title').evaluate(e=>e.scrollIntoView({block:'start'}));
      await id('compare-prediction').tap();
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const geometry=await page.evaluate(()=>{
        const v=visualViewport,rect=id=>{const box=document.querySelector('#'+id).getBoundingClientRect();return [Math.round(box.top-v.offsetTop),Math.round(box.bottom-v.offsetTop)];};
        return {height:v.height,width:v.width,focus:document.activeElement.id,question:rect('prediction-prompt'),evidence:rect('prediction-evidence'),answer:rect('prediction')};
      });
      events.push({lesson,width,height,...geometry});
      if(!baseline){
        assert.equal(geometry.focus,'prediction');
        assert.ok(geometry.question[0]>=0 && geometry.evidence[1]<geometry.height);
        assert.ok(geometry.height-geometry.answer[0]>=44,'The start of the note is reachable below the evidence.');
      }
      assert.equal(await id('prediction').inputValue(),note);
      if(height!==844)await page.screenshot({path:join(out,lesson+'-'+width+'x'+height+'.jpg'),type:'jpeg',quality:71});
    }
    if(!baseline){
      await page.setViewportSize({width,height:844});
      await id('compare-prediction').tap();
      await page.setViewportSize({width,height:340});
      await page.waitForFunction(()=>{
        const v=visualViewport,prompt=document.querySelector('#prediction-prompt').getBoundingClientRect(),a=document.querySelector('#prediction').getBoundingClientRect();
        return prompt.top>=v.offsetTop && a.top+44<=v.offsetTop+v.height;
      });
      if(lesson==='vector-add'){
        await id('case').selectOption('1');
        await id('map-identity').filter({hasText:'3 × 16'}).waitFor();
        assert.match(await id('prediction-prompt').innerText(),/3 blocks × 16/);
        assert.equal(await id('prediction').inputValue(),'');
        await id('map-step').selectOption('3');
        assert.match(await id('map-equation').innerText(),/2 × 16 \+ 0 = 32/);
        await id('case').selectOption('0');
        assert.equal(await id('prediction').inputValue(),note);
        caseChanges.push({lesson,width,question:await id('prediction-prompt').innerText(),restored:true});
      }else{
        await id('guided-task').selectOption('host');
        const options=id('program-options');
        assert.equal(await options.evaluate(e=>e.open),false);
        assert.match(await id('program-options-title').innerText(),/Prepare starting program/);
        await options.locator('summary').tap();
        assert.match(await id('setup-status').innerText(),/Prepare replaces/);
        await id('prepare-task').tap();await id('prediction-prompt').filter({hasText:'kernel stores 73'}).waitFor();
        await id('undo-prepare').tap();await id('prediction-prompt').filter({hasText:'kernel stores 42'}).waitFor();
        assert.equal(await id('prediction').inputValue(),note);
        caseChanges.push({lesson,width,preparedAndUndone:true,notePreserved:true});
      }
    }
    await ctx.close();
  }
} finally {
  await writeFile(join(out,'return.json'),JSON.stringify({events,caseChanges},null,2)+'\n');
  for(const close of clean)await close();
}
