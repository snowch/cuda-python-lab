import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const directory = process.env.CAPTURE_DIR || 'test-results/guided';
await mkdir(directory,{recursive:true});
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
try{
 const url=await serveBuild(t),browser=await launchChromium(t),page=await browser.newPage();
 await page.goto(url+'#lesson/softmax');
 const editor=page.getByRole('textbox',{name:'Python program source'});
 await editor.waitFor();
 const task=page.getByRole('combobox',{name:'Guided task'}), answer=page.locator('#prediction');
 async function capture(state,locator){
   for(const width of [390,820,1440])for(const theme of ['light','dark']){
     await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme:theme});
     await page.waitForFunction(v=>document.documentElement.dataset.theme===v,theme);
     await locator.evaluate(el=>el.scrollIntoView({block:'center'}));
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     for(const el of await page.locator('.guided :is(button,select,a):visible,.prediction textarea:visible').all()){
       const b=await el.boundingBox();assert.ok(b.x>=0 && b.x+b.width<=width+1);
     }
     await page.screenshot({path:directory+'/'+state+'-'+width+'-'+theme+'.png'});
   }
   console.log(state,await task.inputValue(),await page.locator('#prediction-prompt').innerText(),await page.locator('#setup-status').innerText());
   if(process.env.AXE_JS){
     await page.addScriptTag({path:process.env.AXE_JS});
     const report=await page.evaluate(()=>window.axe.run(['.guided','.prediction']));
     console.log('axe',state,report.violations.map(v=>v.id),report.incomplete.map(v=>v.id));
     assert.deepEqual(report.violations.map(v=>v.id),[]);
   }
 }
 const saved=()=>page.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 await task.selectOption('sums');await answer.fill('Columns 0 and 2 tie.');await saved();
 await page.locator('#editor-tools').evaluate(el=>el.open=true);
 const d=page.waitForEvent('download');await page.locator('#download-source').click();
 const code=await readFile(await(await d).path(),'utf8');
 await editor.press('Control+a');await page.keyboard.insertText(code.replaceAll(' - row_max)',' )'));await saved();
 await task.selectOption('lane');await saved();
 assert.equal(await answer.inputValue(),'');
 const prepare=page.getByRole('button',{name:'Prepare starting program'});
 await prepare.focus();await capture('dirty',page.locator('.guided'));
 await prepare.press('Enter');await saved();
 await page.locator('#undo-prepare').waitFor();await capture('prepared',page.locator('.guided'));
 await page.locator('#undo-prepare').focus();await page.keyboard.press('Enter');await saved();
 await capture('undone',page.locator('.guided'));
 await answer.fill('Lane 0 writes columns 0 and 32.');await saved();await capture('wide-answer',page.locator('.prediction'));
 await task.selectOption('sums');await saved();
 assert.equal(await answer.inputValue(),'Columns 0 and 2 tie.');
 await capture('extreme-answer',page.locator('.prediction'));
 await page.locator('#task-console').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator(':focus').getAttribute('id'),'console-title');
 console.log('Keyboard prepare, undo, independent answers, and Console focus verified.');
}finally{for(const f of clean)await f();}
