import assert from 'node:assert/strict';
import test from 'node:test';
import {modules,lessons} from '../src/course.mjs';
import {serveBuild,launchChromium} from './browser-support.mjs';
const editor=page=>page.getByRole('textbox',{name:'Python program source'});
test('the bare homepage orients visitors and the start link preserves saved lesson work',async t=>{
 const base=await serveBuild(t),browser=await launchChromium(t),page=await browser.newPage();
 await page.goto(base+'#lesson/first-value');await editor(page).waitFor();await page.locator('#prediction').fill('I expect 73.');
 await page.goto(base);await page.getByRole('img',{name:'From a Python program to GPU threads and back',exact:true}).waitFor();
 assert.equal(await editor(page).count(),0);
 await page.getByRole('link',{name:'Start the first lab',exact:true}).focus();await page.keyboard.press('Enter');await editor(page).waitFor();
 assert.equal(await page.locator('#prediction').inputValue(),'I expect 73.');
 assert.equal(await page.locator('#run-output').textContent(),'');
});
test('all lesson topic references and shared ending components are present',async t=>{
 const base=await serveBuild(t),browser=await launchChromium(t),page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const slug of modules.flatMap(m=>m.lessons)){
  await page.goto(base+'#lesson/'+slug);await page.waitForFunction(title=>document.querySelector('h1')?.textContent===title,lessons[slug].title);await editor(page).waitFor();
  const references=page.locator('#lesson-references');await references.locator('summary').click();
  assert.ok(await references.locator('.topic-references li').count()>=2,slug);
  for(const link of await references.locator('.topic-references a').all()){
   const href=await link.getAttribute('href');assert.ok(href.startsWith('https://'));
   if(href.includes('numba-cuda-mlir'))assert.ok(href.includes('/0.6.0/'));
  }
  assert.ok(!(await references.locator('summary').textContent()).includes('Official guides'));
  assert.equal(await page.locator('.lesson-footer .lesson-card').count(),2);
  assert.ok(await page.getByRole('checkbox',{name:'Mark lesson complete'}).isVisible());
  for(const summary of await page.locator('.resource-row > summary').all())assert.equal(await summary.locator('svg.material-symbol').count(),2);
 }
 for(const width of [390,820,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});
  await page.goto(base+'#lesson/coalescing');await page.reload();await editor(page).waitFor();
  await page.locator('#course-nav > summary').click();
  const columns=await page.locator('#lesson-nav').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
  assert.equal(columns,{390:1,820:2,1440:4}[width]);
  await page.locator('#course-nav > summary').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.lesson-resources').scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/shared-style-${width}-${theme}.png`});
 }
 assert.deepEqual(errors,[]);
});
test('completion survives stale snapshots and concurrent edits in another tab',async t=>{
 const base=await serveBuild(t),browser=await launchChromium(t),context=await browser.newContext();
 const page=await context.newPage(),other=await context.newPage();
 for(const p of [page,other]){await p.goto(base+'#lesson/first-value');await editor(p).waitFor();}
 await other.locator('#prediction').fill('Keep this prediction');
 await page.getByRole('checkbox',{name:'Mark lesson complete'}).check();
 await other.waitForFunction(()=>document.getElementById('complete').checked);
 await other.locator('#prediction').fill('Keep this updated prediction');
 await page.reload();await editor(page).waitFor();
 assert.ok(await page.locator('#complete').isChecked());
 assert.equal(await page.locator('#course-progress').textContent(),'1 / 17 complete');
 await other.reload();await editor(other).waitFor();assert.equal(await other.locator('#prediction').inputValue(),'Keep this updated prediction');
 await page.getByRole('checkbox',{name:'Mark lesson complete'}).uncheck();
 await other.waitForFunction(()=>!document.getElementById('complete').checked);
 await page.locator('#course-location a').click();await page.locator('.course-modules').waitFor();
 assert.ok((await page.url()).endsWith('#course/section-0'));
 await context.close();
});
