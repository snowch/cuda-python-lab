import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const [build,out]=process.argv.slice(2), rows=[];
await mkdir(out,{recursive:true});
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
try {
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(build)+'/')}), browser=await launchChromium(t);
 const page=await browser.newPage({viewport:{width:320,height:850},hasTouch:true,reducedMotion:'reduce'});
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  for(const route of ['lesson/first-value','lesson/softmax','gpu','compiler']){
   await page.goto(url+'#'+route);await page.locator('main h1').waitFor();
   await page.evaluate(()=>{for(const d of document.querySelectorAll('#starter-notes,#editor-tools,#trace-inputs,#trace-memory'))d.open=true;});
   if(route==='lesson/first-value'){
    await page.locator('#trace-step').selectOption('5');await page.locator('[data-buffer="1"]').tap();
    const snapshot=await page.locator('.value-trace').ariaSnapshot();
    assert.match(snapshot,/button "Device out \[42\] Written" \[pressed\]/);
    await writeFile(join(out,'trace-accessible-tree.txt'),snapshot);
   }
   if(route==='gpu'){
    const samples=page.locator('.reading pre');
    for(const el of await samples.all()){
     if(!await el.evaluate(node=>node.scrollWidth>node.clientWidth))continue;
     await el.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.activeElement.scrollLeft>0);
     rows.push({theme,region:await el.getAttribute('aria-label'),keyboardScroll:await el.evaluate(node=>node.scrollLeft)});
    }
   }
   await page.addScriptTag({path:process.env.AXE_PATH});
   const report=await page.evaluate(async()=>{
    const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']}});
    return {axe:axe.version,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),overflow:document.documentElement.scrollWidth-innerWidth};
   });
   rows.push({route,theme,...report});
  }
 }
} finally{await writeFile(join(out,'expanded-axe.json'),JSON.stringify(rows,null,2));for(const f of clean)await f();}
