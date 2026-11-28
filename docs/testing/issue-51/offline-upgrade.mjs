// Serve the two real built releases at one scope; no fabricated version or service worker.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';

const [oldBuild,newBuild,out]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const old=JSON.parse(await readFile(join(oldBuild,'release.json'))),next=JSON.parse(await readFile(join(newBuild,'release.json')));
const clean=[],events=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
let directory=pathToFileURL(resolve(oldBuild)+'/');
try{
 const url=await serveBuild(t,{prefix:'/cuda-python-lab/',directory:()=>directory});
 const browser=await launchChromium(t), ctx=await browser.newContext({viewport:{width:390,height:850}});
 await ctx.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 const p=await ctx.newPage(),v=await ctx.newPage();
 const editor=p=>p.getByRole('textbox',{name:'Python program source'});
 const release=p=>p.locator('meta[name="gpu-release"]').getAttribute('content');
 const saved=p=>p.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 const download=async p=>{
  await p.locator('#editor-tools').evaluate(d=>d.open=true);
  const [f]=await Promise.all([p.waitForEvent('download'),p.locator('#download-source').click()]);
  await p.locator('#editor-tools').evaluate(d=>d.open=false);return readFile(await f.path(),'utf8');
 };
 const replace=async(p,txt)=>{await editor(p).press('Control+a');await p.keyboard.insertText(txt);await saved(p);};
 async function run(p){await p.locator('#run').click();await p.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});return p.locator('#run-output').innerText();}
 async function install(p){
  await p.locator('#app-status-open').click();await p.locator('#app-status-details').evaluate(d=>d.open=true);
  await p.locator('#download-update').filter({hasText:'Save offline copy'}).click();await p.locator('#version-status').filter({hasText:'Downloaded and ready to use offline'}).waitFor({timeout:90000});
  await p.locator('#app-status-close').click();
 }
 async function cacheInventory(p,id) {
  return p.evaluate(async id=>{
   const files=[];
   for(const name of (await caches.keys()).filter(name=>name.endsWith('release-'+id)))for(const req of await (await caches.open(name)).keys()){
    if(req.url.includes('/media/'))files.push(new URL(req.url).pathname.split('/media/')[1]);
   }
   return [...new Set(files)].sort();
  },id);
 }
 await p.goto(url+'#lesson/first-value');await editor(p).waitFor();await install(p);
 await v.goto(url+'#lesson/vector-add');await editor(v).waitFor();
 const firstProgram=(await download(p)).replace('out[0] = 42','out[0] = 73');await replace(p,firstProgram);
 await p.locator('#prediction').fill('Host 0, store 73. Keep this note through the update.');await p.locator('#complete').check();await saved(p);
 await v.locator('#prediction').fill('Earlier 2 by 32 prediction');await saved(v);await v.locator('#case').selectOption('1');
 const vectorProgram=(await download(v)).replace('kernel[3, 16]','kernel[1, 32]');await replace(v,vectorProgram);
 await v.locator('#prediction').fill('In my one-block edit I expect the final zero.');await saved(v);
 const inventory=await cacheInventory(p,old.id);assert.ok(inventory.includes('first-value/walkthrough.mp4'));
 await ctx.setOffline(true);await p.reload();await editor(p).waitFor();
 assert.equal(await run(p),'out = [73.0]');await p.locator('#walkthrough > summary').click();
 async function play(p,slug,seek){
  const video=p.locator('video[data-walkthrough="'+slug+'"]');
  return video.evaluate(async(el,seek)=>{el.muted=true;el.textTracks[0].mode='showing';await el.play();el.currentTime=seek;await new Promise(r=>el.addEventListener('seeked',r,{once:true}));el.pause();return {duration:el.duration,caption:el.textTracks[0].activeCues[0]?.text};},seek);
 }
 const originalMovie=await play(p,'first-value',60);assert.match(originalMovie.caption,/writes 42/);
 await ctx.setOffline(false);directory=pathToFileURL(resolve(newBuild)+'/');
 await p.locator('#app-status-open').click();await p.locator('#app-status-details').evaluate(d=>d.open=true);
 await p.locator('#check-update').click();await p.locator('#version-status').filter({hasText:'Update available'}).waitFor({timeout:90000});
 await p.locator('#download-update').click();await p.locator('#restart-update').waitFor({state:'visible',timeout:90000});
 assert.equal(await release(p),old.id);assert.equal(await release(v),old.id);
 await ctx.setOffline(true);
 assert.match((await play(p,'first-value',60)).caption,/writes 42/);
 const oldVector=await run(v);assert.equal(JSON.parse(oldVector.slice(6)).at(-1),0);
 events.push({beforeRestart:{bothTabs:old.id,oldOfflineMedia:inventory,firstStdout:'out = [73.0]',vectorStdout:oldVector,originalMovie}});
 await p.locator('#restart-update').click();
 for(const page of [p,v])await page.waitForFunction(id=>document.querySelector('meta[name="gpu-release"]')?.content===id,next.id,{timeout:90000});
 await editor(v).waitFor();await editor(p).waitFor();
 assert.equal(await download(p),firstProgram);assert.ok(await p.locator('#complete').isChecked());
 assert.equal(await p.locator('#prediction').inputValue(),'Host 0, store 73. Keep this note through the update.');
 assert.equal(await p.locator('video').count(),0);await p.locator('#walkthrough').evaluate(d=>d.open=true);
 assert.equal(await p.locator('#walkthrough-transcript h3:visible').count(),7);
 await p.locator('#trace-step').selectOption('6');assert.deepEqual(await p.locator('[data-value]').allTextContents(),['[0]','[73]','[73]']);
 assert.equal(await run(p),'out = [73.0]');
 assert.equal(await v.locator('#case').inputValue(),'1');assert.equal(await download(v),vectorProgram);
 assert.match(await v.locator('#prediction-prompt').innerText(),/1 block × 32/);
 assert.equal(await v.locator('#prediction').inputValue(),'In my one-block edit I expect the final zero.');
 assert.equal(await run(v),oldVector);
 await v.locator('#case').selectOption('0');assert.equal(await v.locator('#prediction').inputValue(),'Earlier 2 by 32 prediction');
 await v.locator('#map-inputs').evaluate(d=>d.open=true);await v.locator('#map-launch').selectOption('1 × 32');await v.locator('#map-initial').selectOption('-1');await v.locator('#map-apply').click();
 await v.locator('#map-preview').filter({hasText:'Controls match'}).waitFor();await saved(v);
 const fresh=await run(v);assert.equal(JSON.parse(fresh.slice(6)).at(-1),-1);
 await v.locator('#walkthrough').evaluate(d=>d.open=true);const retainedMovie=await play(v,'vector-add',40);assert.match(retainedMovie.caption,/writes ninety-nine/);
 const newFiles=await cacheInventory(v,next.id);assert.equal(newFiles.length,48);
 assert.ok(newFiles.every(f=>!f.startsWith('first-value/')));
 events.push({afterOfflineRestart:{bothTabs:next.id,firstStdout:'out = [73.0]',freshVectorStdout:fresh,retainedMovie,newMedia:newFiles,caseAnswersPreserved:true,programsByteIdentical:true,completion:true}});
 // A fresh profile has no old media or learner work. Count requests during a clean install.
 await ctx.setOffline(false);
 const cleanCtx=await browser.newContext(),cleanPage=await cleanCtx.newPage(),requests=[];
 cleanCtx.on('request',req=>{if(req.url().includes('/media/'))requests.push(req.url());});
 await cleanPage.goto(url+'#lesson/first-value');await editor(cleanPage).waitFor();await install(cleanPage);
 const installed=await cacheInventory(cleanPage,next.id);assert.deepEqual(installed,newFiles);
 assert.ok(requests.every(s=>!s.includes('/media/first-value/')));
 events.push({cleanInstall:{release:await release(cleanPage),cachedMedia:installed.length,retiredMediaRequests:requests.filter(s=>s.includes('/media/first-value/')).length}});
 console.log('Verified clean installation, both old tabs before restart, offline restart, byte-exact drafts, answers and completion, actual new simulator execution and retained video playback.');
}finally{await writeFile(join(out,'upgrade.json'),JSON.stringify(events,null,2)+'\n');for(const f of clean)await f();}
