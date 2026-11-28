// Native page zoom in an isolated full Chromium profile.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {serveBuild} from '../../../tests/browser-support.mjs';
const [build,out]=process.argv.slice(2),profile=await mkdtemp(join(tmpdir(),'cuda-mapper-zoom-'));
const cleanup=[],t={after:f=>cleanup.unshift(f)};
await mkdir(out,{recursive:true});
try{
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')});
 const context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||chromium.executablePath(),viewport:null,args:['--window-size=1280,900']});
 cleanup.unshift(()=>context.close());
 const settings=await context.newPage();await settings.goto('chrome://settings/appearance');
 const page=await context.newPage();await page.goto(url+'#lesson/vector-add');await page.locator('#map-step').selectOption('3');
 const geometry=()=>page.evaluate(()=>({viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,dpr:devicePixelRatio}));
 const before=await geometry();await settings.evaluate(()=>chrome.settingsPrivate.setDefaultZoom(2));
 await page.waitForFunction(w=>innerWidth<=w/2+1,before.viewport);const after=await geometry();
 assert.equal(after.pageWidth,after.viewport);assert.equal(after.dpr,before.dpr*2);
 await page.locator('#map-equation').evaluate(e=>e.scrollIntoView({block:'center'}));await page.bringToFront();
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const cdp=await context.newCDPSession(page),shot=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:76,fromSurface:false});
 await writeFile(join(out,'zoom.jpg'),Buffer.from(shot.data,'base64'));await cdp.detach();
 await writeFile(join(out,'zoom.json'),JSON.stringify({browser:context.browser().version(),before,after},null,2)+'\n');
}finally{for(const f of cleanup)await f();await rm(profile,{recursive:true,force:true});}
