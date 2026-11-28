import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {launchChromium} from '../../../../tests/browser-support.mjs';

const [preview, output] = process.argv.slice(2);
if (!preview || !output) throw Error('Provide the HTML from probe.py and a screenshot directory.');
await mkdir(output, {recursive:true});
const cleanup = [];
try {
  const browser = await launchChromium({after:fn=>cleanup.push(fn), diagnostic:console.log});
  const page = await browser.newPage({viewport:{width:1180,height:1030}});
  await page.route(/^https?:/, route=>route.abort());
  await page.setContent(await readFile(preview, 'utf8'));
  await page.getByRole('heading', {name:'Guided starting results'}).waitFor();
  assert.equal(await page.getByText('Starting result failed its check.', {exact:false}).count(), 3);
  await page.screenshot({path:join(output,'starting-values.png')});
  await page.getByRole('heading', {name:'Restoring atomic addition changes what can be verified'})
    .evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:join(output,'starting-race.png')});
} finally {
  for (const close of cleanup) await close();
}
