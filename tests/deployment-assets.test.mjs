import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {zipSync,unzipSync} from 'fflate';
import {buildOffline} from '../scripts/offline.mjs';
import {retainPublishedReleases} from '../scripts/retain-releases.mjs';
import {serveBuild,launchChromium} from './browser-support.mjs';
const editor=page=>page.getByRole('textbox',{name:'Python program source'});
const finished=page=>page.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
async function replace(page,source){await editor(page).press('ControlOrMeta+a');await page.keyboard.insertText(source);}

test('unchanged builds keep compiler and GPU archive bytes stable across build times',async()=>{
 const before=JSON.parse(await readFile(new URL('../dist/release.json',import.meta.url),'utf8'));
 await new Promise(resolve=>setTimeout(resolve,2100));
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:new URL('../',import.meta.url),stdio:'pipe',env:{...process.env,PUBLISHED_COURSE_URL:'',TZ:'America/Los_Angeles'}});
 const after=JSON.parse(await readFile(new URL('../dist/release.json',import.meta.url),'utf8'));
 assert.equal(after.id,before.id,'a rebuild of the same source must not invent a new release');
 for(const path of ['runtime/llvmlite.zip','gpu/cuda-python-investigations.zip'])assert.equal(after.files.find(f=>f.path===path).sha256,before.files.find(f=>f.path===path).sha256,path);
});

test('retention verifies prior bytes, keeps a bounded history and rejects corruption',async t=>{
 const directory=await mkdtemp(tmpdir()+'/cuda-python-retain-');t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(directory+'/index.html','new page');
 const make=(id,contents)=>{const files=Object.entries(contents).map(([path,body])=>({path,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')}));return {schema:1,id,commit:null,date:null,files,bytes:files.reduce((n,f)=>n+f.bytes,0)};};
 const a='a'.repeat(64),b='b'.repeat(64),current=make(b,{'index.html':'page B','runtime/llvmlite.zip':'compiler B'}),old=make(a,{'index.html':'page A','runtime/llvmlite.zip':'compiler A'});
 current.retainedReleases=[a];const bodies=new Map([['/release.json',JSON.stringify(current)],['/releases/'+a+'/release.json',JSON.stringify(old)]]);
 for(const [id,files] of [[b,{'index.html':'page B','runtime/llvmlite.zip':'compiler B'}],[a,{'index.html':'page A','runtime/llvmlite.zip':'compiler A'}]])for(const [path,body]of Object.entries(files))bodies.set('/releases/'+id+'/'+path,body);
 const fetcher=async url=>new Response(bodies.get(url.pathname)??'missing',{status:bodies.has(url.pathname)?200:404});
 assert.deepEqual(await retainPublishedReleases(directory,'https://course.test/',{fetcher}),[b,a]);
 assert.equal(await readFile(directory+'/releases/'+a+'/runtime/llvmlite.zip','utf8'),'compiler A');
 assert.deepEqual(await retainPublishedReleases(directory,'https://course.test/',{fetcher,currentId:b,keep:1}),[a]);
 bodies.set('/releases/'+b+'/runtime/llvmlite.zip','corrupt bytes');
 await assert.rejects(retainPublishedReleases(directory,'https://course.test/',{fetcher}),/failed verification/);
});

test('an open lesson runs after deployment; an expired runtime recovers without losing 43 or the prior result',{timeout:240000},async t=>{
 const scratch=await mkdtemp(tmpdir()+'/cuda-python-deployment-');t.after(()=>rm(scratch,{recursive:true,force:true}));
 const old=new URL('../dist/',import.meta.url),next=scratch+'/next',expired=scratch+'/expired';await cp(old,next,{recursive:true});await rm(next+'/releases',{recursive:true});
 let html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');html=html.replace('</body>','<span hidden class="build-info">Test deployment B</span></body>');await writeFile(next+'/index.html',html);
 const original=JSON.parse(await readFile(new URL('../dist/release.json',import.meta.url),'utf8'));
 const zip=unzipSync(await readFile(next+'/runtime/llvmlite.zip'));await writeFile(next+'/runtime/llvmlite.zip',zipSync(zip,{mtime:new Date('2001-01-01T00:00:00Z')}));
 const second=await buildOffline(next,{commit:'b'.repeat(40),date:'2026-11-22'});
 let current=old;const base=await serveBuild(t,{prefix:'/cuda-python-lab/',directory:()=>current}),browser=await launchChromium(t);
 const context=await browser.newContext(),recoveryContext=await browser.newContext();
 for(const c of [context,recoveryContext])await c.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
 const page=await context.newPage(),recover=await recoveryContext.newPage();
 for(const p of [page,recover]){await p.goto(base+'#lesson/first-value');await editor(p).waitFor();await p.waitForFunction(()=>!!navigator.serviceWorker.controller);}
 // The retained tab has never started its compiler before the deployment.
 const text=await readFile(new URL('../src/kernels/first-value.py',import.meta.url),'utf8');
 const {standaloneProgram}=await import('../src/host-program.mjs'),{lessons}=await import('../src/course.mjs');
 const originalProgram=standaloneProgram(text,lessons['first-value'].cases[0]);
 const edited=originalProgram.replace('out[0] = 42','out[0] = 43').replace('from numba_cuda_mlir import cuda','from numba import cuda');
 await replace(page,edited);await page.locator('#prediction').fill('The CPU prints 43.');
 // Keep a genuine older result, then simulate eviction of just the old compiler ZIP.
 await recover.locator('#run').click();await finished(recover);assert.equal(await recover.locator('#run-output').textContent(),'out = [42.0]');
 await replace(recover,edited);await recover.locator('#prediction').fill('Keep this prediction and 43.');
 await recover.locator('#code-runner-open').click();await recover.getByRole('button',{name:'Free memory',exact:true}).click();await recover.keyboard.press('Escape');
 await recover.evaluate(async()=>{for(const name of await caches.keys()){const cache=await caches.open(name);for(const request of await cache.keys())if(new URL(request.url).pathname.endsWith('/runtime/llvmlite.zip'))await cache.delete(request);}});
 const retained=await retainPublishedReleases(next,base,{currentId:second.id});assert.deepEqual(retained,[original.id]);
 assert.deepEqual(await readFile(next+'/releases/'+original.id+'/runtime/llvmlite.zip'),await readFile(new URL('../dist/runtime/llvmlite.zip',import.meta.url)));
 assert.equal(second.files.some(file=>file.path.startsWith('releases/')),false);
 await cp(next,expired,{recursive:true});await rm(expired+'/releases/'+original.id,{recursive:true});
 current=pathToFileURL(next+'/');await page.locator('#run').click();await finished(page);assert.equal(await page.locator('#run-output').textContent(),'out = [43.0]');
 assert.equal(await page.locator('meta[name="gpu-release"]').getAttribute('content'),original.id);
 // Beyond retention, classify download failure separately and keep the previous result.
 current=pathToFileURL(expired+'/');await recover.locator('#run').click();await recover.locator('#runtime-recovery').waitFor();
 assert.equal(await recover.locator('#run-status').textContent(),'Code runner files could not be loaded.');
 assert.equal(await recover.locator('#run-output').textContent(),'out = [42.0]');
 assert.equal(await recover.evaluate(()=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).results['first-value'][0].output),'out = [42.0]');
 for(const [width,theme]of[[390,'dark'],[1440,'light']]){
  await recover.setViewportSize({width,height:1000});await recover.emulateMedia({colorScheme:theme});
  assert.ok(await recover.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await recover.locator('.run-console').screenshot({path:`test-results/runtime-recovery-${width}-${theme}.png`});
 }
 await recover.evaluate(()=>{window.savedStorageSetter=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Blocked','SecurityError');};});
 await recover.getByRole('button',{name:'Reload lesson',exact:true}).click();await recover.locator('#runtime-recovery-note').filter({hasText:'Reload cancelled:'}).waitFor();
 assert.equal(await recover.locator('meta[name="gpu-release"]').getAttribute('content'),original.id);
 await recover.evaluate(()=>{Storage.prototype.setItem=window.savedStorageSetter;});
 await recover.getByRole('button',{name:'Reload lesson',exact:true}).click();await recover.waitForFunction(id=>document.querySelector('meta[name="gpu-release"]')?.content===id,second.id);await editor(recover).waitFor();
 assert.equal(await recover.locator('#prediction').inputValue(),'Keep this prediction and 43.');
 assert.ok(await recover.evaluate(()=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).programs['first-value'][0].includes('out[0] = 43')));
 await recover.locator('#editor-tools > summary').click();await recover.getByRole('button',{name:'Update CUDA imports',exact:true}).click();
 assert.ok(await recover.evaluate(()=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).programs['first-value'][0].includes('out[0] = 43')));
 assert.ok(!(await recover.evaluate(()=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).programs['first-value'][0])).includes('from numba import cuda'));
 await editor(recover).press('ControlOrMeta+z');assert.ok((await recover.evaluate(()=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).programs['first-value'][0])).includes('from numba import cuda'));
 await recover.locator('#run').click();await finished(recover);assert.equal(await recover.locator('#run-output').textContent(),'out = [43.0]');
 await context.close();await recoveryContext.close();
});
