import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {serveBuild,launchChromium} from '../../../../tests/browser-support.mjs';

const [build,out]=process.argv.slice(2), clean=[], rows=[], scans=[], zoom=[];
const t={after:f=>clean.unshift(f),diagnostic:console.log};
await mkdir(out,{recursive:true});
try {
  const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')});
  const browser=await launchChromium(t);
  const page=await browser.newPage({reducedMotion:'reduce'});
  const geometry=()=>page.evaluate(()=>({
    width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
    editor:document.querySelector('.cm-scroller').clientWidth,
    article:document.querySelector('.lab-layout').clientWidth,
    focus:document.activeElement.id
  }));
  for(const lesson of ['first-value','vector-add','softmax']){
    await page.goto(url+'#lesson/'+lesson);
    await page.locator('.cm-content').waitFor();
    await page.locator('#prediction').fill('Keep this note and keyboard focus during resize.');
    for(const theme of ['light','dark']){
      await page.emulateMedia({colorScheme:theme});
      const widths=Array.from({length:91},(_,i)=>320+i*13);
      for(const width of theme==='light'?widths:widths.reverse()){
        await page.setViewportSize({width,height:1000});
        const metrics=await geometry();
        assert.equal(metrics.overflow,0);
        assert.ok(metrics.editor>=metrics.article-8);
        assert.equal(metrics.focus,'prediction');
        rows.push({lesson,theme,...metrics});
      }
      await page.setViewportSize({width:820,height:1180});
      await page.addScriptTag({path:process.env.AXE_PATH});
      const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,message:n.failureSummary}))})));
      scans.push({lesson,theme,violations});assert.deepEqual(violations,[]);
    }
  }
  const profile=await mkdtemp(join(tmpdir(),'course-zoom-'));
  const full=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.ZOOM_CHROMIUM||chromium.executablePath(),viewport:null,args:['--window-size=1440,960']});
  clean.unshift(()=>full.close(),()=>rm(profile,{recursive:true,force:true}));
  const settings=await full.newPage();await settings.goto('chrome://settings/appearance');
  const tab=await full.newPage();
  for(const lesson of ['first-value','vector-add','softmax'])for(const theme of ['light','dark']){
    await tab.goto(url+'#lesson/'+lesson);await tab.locator('.cm-content').waitFor();
    await tab.emulateMedia({colorScheme:theme});
    for(const factor of [1,1.5,2]){
      await settings.evaluate(f=>chrome.settingsPrivate.setDefaultZoom(f),factor);
      await tab.waitForFunction(f=>devicePixelRatio===f,factor);
      const metrics=await tab.evaluate(()=>({width:innerWidth,content:document.documentElement.scrollWidth,dpr:devicePixelRatio}));
      assert.equal(metrics.width,metrics.content);
      zoom.push({lesson,theme,factor,...metrics});
    }
    await tab.locator('#source').evaluate(e=>e.scrollIntoView({block:'center'}));
    await tab.bringToFront();
    const cdp=await full.newCDPSession(tab);
    const shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:65,fromSurface:false});
    await writeFile(join(out,lesson+'-'+theme+'-200.jpg'),Buffer.from(shot.data,'base64'));
    await cdp.detach();
  }
} finally {
  await writeFile(join(out,'resize.json'),JSON.stringify({rows,scans,zoom},null,1)+'\n');
  for(const f of clean)await f();
}
