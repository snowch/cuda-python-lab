// Render two competing reading sequences on the same saved build before choosing a layout.
import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium, serveBuild} from '../../../../tests/browser-support.mjs';

const [build, out] = process.argv.slice(2);
await mkdir(out, {recursive: true});
const cleanup = [], test = {after: f => cleanup.unshift(f), diagnostic: console.log};
const measurements = [];
try {
  const url = await serveBuild(test, {directory: pathToFileURL(resolve(build) + '/')});
  const browser = await launchChromium(test);
  for (const design of ['stack', 'paired']) {
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
    for (const lesson of ['first-value','vector-add','softmax']) {
      await page.goto(url+'#lesson/'+lesson);
      await page.locator('#source .cm-content').waitFor();
      await page.evaluate(() => {
        const q = s => document.querySelector(s), model = q('.value-trace');
        if (model) q('.lab-layout').before(model);
        q('#task-brief').removeAttribute('open');
        q('.prediction-comparison')?.remove();
        q('#goto-trace')?.remove();
      });
      await page.addStyleTag({content: `
        .lab-layout{display:block}.lab-plan{margin-bottom:1rem}
        .guided,.prediction{max-width:78ch}.value-trace{background:transparent;border:0;border-block:1px solid var(--line);border-radius:0;padding-inline:0}
        .lab-plan .prediction{background:transparent;border:0;border-top:1px solid var(--line);padding:1rem 0}
        `+(design==='paired'?`@media(min-width:1200px){.workbench{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start}.workbench-card + .workbench-card{border-top:0;border-left:1px solid var(--line)}}`:'')});
      for (const [width,height] of [[820,1180],[1440,930]]) {
        await page.setViewportSize({width,height});
        await page.evaluate(()=>scrollTo(0,0));
        const file = design+'-'+lesson+'-'+width;
        await page.screenshot({path:join(out,file+'-page.jpg'),type:'jpeg',quality:52,fullPage:true});
        await page.locator('#source').evaluate(e=>e.scrollIntoView({block:'center'}));
        await page.screenshot({path:join(out,file+'-code.jpg'),type:'jpeg',quality:63});
        measurements.push(await page.evaluate(({file})=>({file,code:document.querySelector('.cm-scroller').clientWidth,output:document.querySelector('.run-console').clientWidth}),{file}));
      }
    }
    await page.close();
  }
  await writeFile(join(out,'measurements.json'),JSON.stringify(measurements,null,2)+'\n');
} finally {for(const close of cleanup) await close();}
