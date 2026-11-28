// Inspect the actual release in Chromium. Full route captures can be regenerated at any time.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {lessons} from '../../../src/course.mjs';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const [build,out,mode='scan']=process.argv.slice(2);
await mkdir(out,{recursive:true});
const cleanup=[], t={after:f=>cleanup.unshift(f),diagnostic:console.log};
const rows=[];
try {
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}), browser=await launchChromium(t);
 const page=await browser.newPage({reducedMotion:'reduce'});
 for(const width of [320,390,820,1440]) for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:850}); await page.emulateMedia({colorScheme:theme});
  const routes=mode==='prototype'?['first-value','softmax']:['course',...Object.keys(lessons),'gpu','compiler'];
  for(const slug of routes){
   await page.goto(url+'#'+(lessons[slug]?'lesson/':'')+slug);await page.locator('main h1').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   if(lessons[slug]){
    await page.locator('#guided-task').selectOption({index:Math.min(3,await page.locator('#guided-task option').count()-1)});
    if(mode==='prototype') await page.evaluate(()=>{
      const aside=document.createElement('div'), group=document.createElement('div'), plan=document.querySelector('.guided'), bench=document.querySelector('.workbench');
      plan.before(group);group.append(aside,bench);aside.append(plan,document.querySelector('.prediction'));
      group.style.cssText='display:grid;gap:16px;align-items:start;grid-template-columns:'+(innerWidth>=800?'minmax(0,1fr) minmax(0,2fr)':'minmax(0,1fr)');
      const note=document.createElement('details'), summary=document.createElement('summary');
      summary.textContent='Current task · '+document.querySelector('#guided-task').selectedOptions[0].text;
      note.append(summary,document.querySelector('#task-action').textContent);document.querySelector('.workbench-controls').before(note);
    });
    await page.locator('#run').evaluate(el=>el.scrollIntoView({block:'center'}));
   }
   const metrics=await page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id)?.getBoundingClientRect();return r?Math.round(r.y+scrollY):null;};
    return {overflow:document.documentElement.scrollWidth-innerWidth,action:box('task-action'),editor:box('source'),run:box('run'),console:box('console-title'),brief:box('task-brief')};
   });
   let violations;
   if(mode==='scan' && width===390){
    await page.addScriptTag({path:process.env.AXE_PATH});
    violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});
   }
   await page.screenshot({type:'jpeg',quality:63,path:join(out,slug+'-'+width+'-'+theme+'.jpg')});
   rows.push({slug,width,theme,...metrics,violations});
  }
 }
 assert.equal(rows.length,mode==='prototype'?16:160);
 assert.ok(rows.every(row=>row.overflow===0));
} finally {await writeFile(join(out,'layout.json'),JSON.stringify(rows,null,1));for(const f of cleanup)await f();}
