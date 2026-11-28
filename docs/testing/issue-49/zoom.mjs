// Set Chromium's native default zoom in a throwaway local profile.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {serveBuild} from '../../../tests/browser-support.mjs';
const [build,out]=process.argv.slice(2), temp=await mkdtemp(join(tmpdir(),'cuda-zoom-'));
const clean=[],t={after:f=>clean.unshift(f)};
await mkdir(out,{recursive:true});
try {
 const base=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')});
 const context=await chromium.launchPersistentContext(join(temp,'profile'),{headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),viewport:null,args:['--window-size=1280,900']});
 clean.unshift(()=>context.close());
 const settings=await context.newPage();await settings.goto('chrome://settings/appearance');
 const page=await context.newPage();
 await page.goto(base+'#lesson/first-value');await page.locator('#trace-step').waitFor();
 const geometry=()=>page.evaluate(()=>({layout:innerWidth,width:document.documentElement.scrollWidth,devicePixelRatio}));
 await page.bringToFront();
 const initial=await geometry();
 await settings.evaluate(()=>chrome.settingsPrivate.setDefaultZoom(2));
 const factor=await settings.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.getDefaultZoom(resolve)));
 assert.equal(factor,2);await page.waitForFunction(w=>innerWidth<=w/2+1,initial.layout);
 const results=[];
 for(const route of ['lesson/first-value','lesson/softmax','gpu']){
  await page.goto(base+'#'+route);await page.waitForFunction(hash=>location.hash==='#'+hash,route);
  const target=page.locator(route==='gpu'?'.reading pre':route.endsWith('first-value')?'#trace-step':'#task-brief').first();
  await target.waitFor();await target.evaluate(el=>el.scrollIntoView({block:'center'}));
  const actual=await geometry();assert.ok(actual.width<=actual.layout);results.push({route,...actual});
  await page.bringToFront();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const session=await context.newCDPSession(page);
  const shot=await session.send('Page.captureScreenshot',{format:'jpeg',quality:76,fromSurface:false});
  await writeFile(join(out,route.replace('lesson/','')+'.jpg'),Buffer.from(shot.data,'base64'));await session.detach();
 }
 await writeFile(join(out,'zoom.json'),JSON.stringify({browser:context.browser()?.version(),initial,factor,results},null,2));
} finally {for(const finish of clean)await finish();await rm(temp,{recursive:true,force:true});}
