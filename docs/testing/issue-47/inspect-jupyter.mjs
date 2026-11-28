import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {lessons} from '../../../src/course.mjs';
import {launchChromium} from '../../../tests/browser-support.mjs';

const directory=process.env.EVIDENCE_DIR, server=process.env.JUPYTER_URL;
if (!directory || !server) throw Error('Set EVIDENCE_DIR and the URL of the local JupyterLab server containing the exported files.');
await mkdir(directory,{recursive:true});
const cleanup=[], t={after:fn=>cleanup.unshift(fn),diagnostic:console.log};
try {
  const browser=await launchChromium(t),page=await browser.newPage({viewport:{width:1440,height:950}});
  async function open(slug) {
    const url=new URL(server);
    url.pathname='/lab/workspaces/cuda47-'+slug+'/tree/'+slug+'.ipynb';
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    const viewport=page.locator('.jp-Notebook:visible .jp-WindowedPanel-outer').last();
    await viewport.evaluate(el=>el.scrollTop=0);
    await page.locator('.jp-Notebook:visible h1').filter({hasText:lessons[slug].title}).first().waitFor();
    const news=page.getByRole('button',{name:'No',exact:true});
    if (await news.isVisible()) await news.click();
    console.log('JupyterLab',await page.title(),await page.locator('.jp-Notebook:visible h1').first().innerText());
  }
  async function showHeading(text) {
    const viewport=page.locator('.jp-Notebook:visible .jp-WindowedPanel-outer').last();
    await viewport.evaluate(el=>el.scrollTop=0);
    const heading=page.locator('.jp-Notebook:visible h2').filter({hasText:text}).first();
    for (let i=0;i<80 && !await heading.count();i++) {
      await viewport.evaluate(el=>el.scrollTop+=Math.floor(el.clientHeight*0.7));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    await heading.waitFor({timeout:5000});
    await heading.evaluate(el=>el.scrollIntoView({block:'start'}));
    assert.ok(await heading.isVisible());
  }
  await open('softmax');
  await page.screenshot({path:join(directory,'jupyter-softmax-opening.png')});
  await showHeading('Your exported program');
  await page.screenshot({path:join(directory,'jupyter-softmax-export.png')});
  await showHeading('maximum shift');
  await page.screenshot({path:join(directory,'jupyter-softmax-task.png')});
  await open('precision');
  await showHeading('Change the grouping');
  await page.screenshot({path:join(directory,'jupyter-precision-task.png')});
  for (const slug of Object.keys(lessons)) {
    if (slug==='softmax' || slug==='precision') continue;
    await open(slug);
    await showHeading('Your exported program');
  }
} finally {for (const fn of cleanup) await fn();}
