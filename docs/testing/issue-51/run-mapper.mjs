// Independent oracle: enumerate the launched threads and execute their additions on CPU arrays.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lessons} from '../../../src/course.mjs';
import {standaloneProgram} from '../../../src/host-program.mjs';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';

const [build,out]=process.argv.slice(2), log=[],cleanup=[],t={after:f=>cleanup.unshift(f),diagnostic:console.log};
await mkdir(join(out,'programs'),{recursive:true});
const cases=lessons['vector-add'].cases;
const kernel=await readFile(new URL('../../../src/kernels/vector-add.py',import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
try{
 const base=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}),browser=await launchChromium(t);
 for(const [ci,f] of cases.entries()){
  const context=await browser.newContext({viewport:{width:390,height:850},hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#lesson/vector-add');const id=name=>page.locator('#'+name);
  if(ci)await id('case').selectOption(String(ci));
  await id('map-body').waitFor();
  const n=f.scalars.n,starter=standaloneProgram(kernel,f);
  const configs=n===33?[[2,32],[3,16],[1,32]]:[[1,32]];
  async function exported(){
   await id('editor-tools').evaluate(d=>d.open=true);
   const [d]=await Promise.all([page.waitForEvent('download'),id('download-source').click()]);
   await id('editor-tools').evaluate(e=>e.open=false);
   return readFile(await d.path(),'utf8');
  }
  async function config(blocks,width,cancel,initial){
   await id('map-inputs').evaluate(d=>d.open=true);
   await id('map-launch').selectOption(blocks+' × '+width);await id('map-pair').selectOption(cancel?'cancel':'starter');await id('map-initial').selectOption(String(initial));
   if(await id('map-preview').innerText()!=='Controls match the open Python.'){
    await id('map-apply').click();await id('map-preview').filter({hasText:'Controls match the open Python.'}).waitFor();
    await id('work-status').filter({hasText:'Learner work saved'}).waitFor();
   }
   let source=starter.replace(/kernel\[\d+, \d+\]/,'kernel['+blocks+', '+width+']');
   if(cancel)source=source.replace('    b = cuda.to_device(b_host)','    b_host[-1] = -a_host[-1]\n    b = cuda.to_device(b_host)');
   if(initial===-1)source=source.replace('np.zeros('+n+', dtype=np.float32)','np.full('+n+', -1, dtype=np.float32)');
   assert.equal(await exported(),source);
   const file='n'+n+'-'+blocks+'x'+width+(cancel?'-opposite':'-starter')+'-init'+initial+'.py';
   await writeFile(join(out,'programs',file),source);
   const expected=Array.from({length:n},(_,i)=>cancel && i===n-1?0:3*(i+1));
   const simulatedReference=Array(n).fill(initial), owners=Array(n).fill(null);
   let skipped=0;
   for(let b=0;b<blocks;b++)for(let t=0;t<width;t++){
    const i=b*width+t;
    if(i<n){owners[i]=[b,t];simulatedReference[i]=expected[i];}else skipped++;
   }
   const active=owners.filter(Boolean).length;
   const notes=n+' elements, '+blocks+' × '+width+', last sum '+expected.at(-1)+', initial '+initial+': I predict a printed tail of '+simulatedReference.at(-1)+'.';
   await id('map-predict').press('Enter');await id('prediction').fill(notes);
   await id('compare-prediction').press('Enter');
   assert.equal(await page.locator(':focus').getAttribute('id'),'prediction');
   assert.equal(await id('prediction').inputValue(),notes);
   assert.ok((await id('prediction-prompt').innerText()).includes(blocks+' '+(blocks===1?'block':'blocks')+' × '+width));
   await id('run').press('Enter');await id('run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:90000});
   await page.waitForFunction(({source,ci,caseId})=>{const r=JSON.parse(localStorage.getItem('cuda-python-lab-v1')).results?.['vector-add']?.[ci];return r?.source===source&&r.caseId===caseId;},{source,ci,caseId:f.id});
   const result=await page.evaluate(i=>JSON.parse(localStorage.getItem('cuda-python-lab-v1')).results['vector-add'][i],ci);
   const stdout=await id('run-output').innerText();assert.equal(result.output,stdout);assert.ok(result.ptx.includes('.entry'));
   assert.deepEqual(JSON.parse(stdout.slice('out = '.length)),simulatedReference);
   await id('map-step').selectOption('3');await id('map-element').selectOption(String(n-1));
   assert.match(await id('map-counts').innerText(),new RegExp(active+' active · '+skipped+' skip.*'+(n-active)+' uncovered'));
   assert.ok((await id('map-observed').innerText()).includes('printed out['+(n-1)+'] = '+simulatedReference.at(-1)+'.'));
   log.push({fixture:f.id,file,sourceSHA256:hash(result.source),ptxSHA256:hash(result.ptx),status:result.status,stdout,arithmeticReference:expected,launchReference:simulatedReference,modeled:{blocks,width,n,initial,cancel,active,launched:blocks*width,skipped,covered:active,uncovered:n-active,lastOwner:owners.at(-1)},question:await id('prediction-prompt').innerText(),note:notes});
   console.log(f.id,file,'tail',simulatedReference.at(-1),'sum',expected.at(-1));
  }
  // Run the controlled sequence first, then every remaining selectable variant.
  const planned=n===33?[[2,32,false,0],[3,16,false,0],[1,32,false,0],[1,32,true,0],[1,32,true,-1],[2,32,true,-1]]:[];
  for(const [b,w] of configs)for(const cancel of [false,true])for(const initial of [0,-1])
   if(!planned.some(x=>x.toString()===[b,w,cancel,initial].toString()))planned.push([b,w,cancel,initial]);
  for(const args of planned)await config(...args);
  assert.deepEqual(errors,[]);await context.close();
 }
 assert.equal(log.length,28);
}finally{
 await writeFile(join(out,'recorded-runs.json'),JSON.stringify(log,null,1)+'\n');
 for(const f of cleanup)await f();
}
