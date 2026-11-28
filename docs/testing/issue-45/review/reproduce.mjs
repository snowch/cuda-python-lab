import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {launchChromium,serveBuild} from '../../../../tests/browser-support.mjs';
import {lessons} from '../../../../src/course.mjs';
import {standaloneProgram} from '../../../../src/host-program.mjs';
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
try{
 const url=await serveBuild(t,{directory:pathToFileURL(resolve(process.env.REVIEW_DIST)+'/')});
 const browser=await launchChromium(t),page=await browser.newPage();
 await page.goto(url+'#lesson/softmax');
 const editor=page.getByRole('textbox',{name:'Python program source'});
 const kernel=await readFile(new URL('../../../../src/kernels/softmax.py',import.meta.url),'utf8');
 const [extreme,wide]=lessons.softmax.cases.map(f=>standaloneProgram(kernel,f));
 const dirty=extreme.replaceAll(' - row_max)',' )');
 const custom=wide.replace('# Host code','# Independent host');
 const saved=()=>page.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
 async function type(s){await editor.press('Control+a');await page.keyboard.insertText(s);await saved();}
 async function source(){
   await page.locator('#editor-tools').evaluate(e=>e.open=true);
   const d=page.waitForEvent('download');await page.locator('#download-source').click();return readFile(await(await d).path(),'utf8');
 }
 await type(dirty);await page.locator('#guided-task').selectOption('lane');await type(custom);
 await page.locator('#prepare-task').click();await page.locator('#prepare-task').waitFor({state:'hidden'});await saved();
 assert.equal(await source(),wide);
 await page.locator('#undo-prepare').click();await page.locator('#prepare-task').waitFor();await saved();
 assert.equal(await source(),custom);await page.locator('#case').selectOption('0');
 const other=await source();assert.equal(other,extreme);assert.notEqual(other,dirty);
 console.log('Old implementation: undo restored the exact independent 37-column file. The other case exported the starter kernel, losing its prior shared maximum-shift edit.');
}finally{for(const f of clean)await f();}
