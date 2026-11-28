import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const clean=[], t={after:f=>clean.unshift(f),diagnostic:console.log};
try {
  const base=await serveBuild(t,{directory:pathToFileURL(resolve(process.env.BASE_DIST)+'/')});
  const browser=await launchChromium(t), page=await browser.newPage();
  await page.addInitScript(()=>localStorage.setItem('cuda-python-lab:code-runner-intro:3','1'));
  for(const [slug,from,to,needle,replacement] of [
    ['stencil',1,2,'tile[0] = values[i - 1] if i > 0 else 0.0','tile[0] = 0.0'],
    ['softmax',0,1,'math.exp(values[row, col] - row_max)','math.exp(values[row, col])'],
    ['tiled-transpose',0,1,'PADDING = 1','PADDING = 0'],
    ['precision',0,1,'a[i] + b[i]','a[i] + c[i]'],
  ]) {
    await page.goto(base+'#lesson/'+slug);
    const editor=page.getByRole('textbox',{name:'Python program source'}), tools=page.locator('#editor-tools');
    await editor.waitFor(); await page.locator('#case').selectOption(String(from));
    const prompt=await page.locator('#prediction-prompt').innerText();
    await page.locator('#prediction').fill('Prediction for '+from);
    async function code(){
      await tools.evaluate(el=>el.open=true);
      const d=page.waitForEvent('download'); await page.locator('#download-source').click();
      return readFile(await (await d).path(),'utf8');
    }
    const original=await code(); assert.ok(original.includes(needle));
    let edited=original.replaceAll(needle,replacement);
    if(slug==='precision')edited=edited.replace('first + c[i]','first + b[i]');
    await editor.press('Control+a');await page.keyboard.insertText(edited);
    await page.locator('#case').selectOption(String(to));
    const next=await code();assert.ok(next.includes(replacement));
    async function run(){
      await page.locator('#run').click();await page.locator('#run-status').filter({hasText:'Ran in GPGPU-Sim.'}).waitFor({timeout:80000});
      return page.locator('#run-output').innerText();
    }
    const dirty=await run();
    const retained=await page.locator('#prediction').inputValue(), nextPrompt=await page.locator('#prediction-prompt').innerText();
    assert.equal(nextPrompt,prompt);assert.equal(retained,'Prediction for '+from);
    await tools.evaluate(el=>el.open=true);await page.locator('#restore').click();const cleanOutput=await run();
    console.log(JSON.stringify({slug,from,to,oldPrompt:prompt,nextPrompt,retained,replacement,dirty,cleanOutput}));
  }
} finally {for(const f of clean)await f();}
