import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {standaloneProgram} from '../src/host-program.mjs';
import {lessons} from '../src/course.mjs';
import {coverage,locateThread,vectorPrograms} from '../src/thread-map-model.mjs';
import {launchChromium,serveBuild} from './browser-support.mjs';

const slug='vector-add', fixtures=lessons[slug].cases;
const kernel=await readFile(new URL('../src/kernels/vector-add.py',import.meta.url),'utf8');

test('logical owners agree with an independent enumeration of every block, local thread and cell',()=>{
  for(const f of fixtures) {
    const starter=standaloneProgram(kernel,f), programs=vectorPrograms(starter,f);
    assert.equal(programs.size,f.scalars.n===33?12:4);
    assert.ok(programs.has(starter));
    assert.ok(!programs.has(starter+'# unknown'));
    for(const p of programs.values()){
      const owners=Array(p.n).fill(null), visits=[];
      for(let block=0;block<p.blocks;block++)for(let local=0;local<p.width;local++){
        const i=visits.length;
        visits.push([block,local]);
        if(i<p.n)owners[i]=[block,local];
        const thread=locateThread(p,'thread',i);
        assert.deepEqual([thread.block,thread.local],[block,local]);assert.equal(thread.guard,i<p.n);
        assert.equal(thread.element,i<p.n?i:null);
      }
      const active=owners.filter(Boolean).length;
      assert.deepEqual(coverage(p),{launched:visits.length,active,skipped:visits.length-active,covered:active,uncovered:p.n-active});
      for(const [i,owner] of owners.entries()){
        const cell=locateThread(p,'element',i),sum=p.cancel&&i===p.n-1?0:3*(i+1);
        assert.deepEqual([cell.block,cell.local],owner??[null,null]);
        assert.equal(cell.expected,sum);assert.equal(cell.modeled,owner?sum:p.initial);
        assert.equal(cell.guard,owner?true:null);
      }
      assert.throws(()=>locateThread(p,'thread',visits.length),RangeError);
      assert.throws(()=>locateThread(p,'element',-1),RangeError);
    }
  }
});

test('the mapper protects source identity, host-only ownership and scoped predictions',async t=>{
  const url=await serveBuild(t), browser=await launchChromium(t), page=await browser.newPage();
  const starter=standaloneProgram(kernel,fixtures[0]);
  const other=standaloneProgram(kernel.replace('a[i] + b[i]','a[i] - b[i]'),fixtures[2]);
  await page.addInitScript(older=>{
    if(!localStorage.getItem('cuda-python-lab-v1'))localStorage.setItem('cuda-python-lab-v1',JSON.stringify({programs:{'vector-add':{2:older}}}));
  },other);
  await page.goto(url+'#lesson/vector-add');
  const id=s=>page.locator('#'+s), editor=page.getByRole('textbox',{name:'Python program source'});
  const block=page.getByRole('button',{name:'Block 1 i = 32–63',exact:true});
  await block.press('Enter');
  assert.equal(await id('map-thread').inputValue(),'32');
  await id('map-predict').press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'prediction');
  await id('prediction').fill('2 × 32, normal inputs, zero initial: last 99');
  await id('map-inputs summary').click();await id('map-launch').selectOption('1 × 32');
  await id('map-initial').selectOption('-1');await id('map-pair').selectOption('cancel');
  assert.match(await id('prediction-prompt').innerText(),/2 blocks × 32/);
  assert.match(await id('map-preview').innerText(),/kernel\[1, 32\].*b_host\[-1\].*np.full/s);
  await id('map-apply').press('Enter');await id('comparison-question').filter({hasText:'1 block × 32'}).waitFor();
  assert.match(await id('comparison-evidence').innerText(),/33 and -33.*starts at -1/);
  assert.match(await id('brief-prediction').innerText(),/earlier runs.*last 99/);
  await id('map-step').selectOption('3');assert.match(await id('map-equation').innerText(),/no launched owner/);
  assert.equal(await id('map-thread').inputValue(),'');assert.match(await id('map-cells').innerText(),/stays -1/);
  await id('map-undo').press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'undo-prepare');
  await id('undo-prepare').press('Enter');await id('comparison-question').filter({hasText:'2 blocks × 32'}).waitFor();
  await id('case').selectOption('2');await id('map-unavailable').waitFor();
  assert.match(await editor.innerText(),/a\[i\] - b\[i\]/);
  await id('case').selectOption('0');await id('map-body').waitFor();
  assert.ok((await id('prediction').inputValue()).includes('last 99'));
  await editor.press('Control+a');await page.keyboard.insertText(starter+'# my exact source\n');
  await id('map-unavailable').waitFor();assert.match(await id('comparison-question').innerText(),/edited vector program/);
  await id('work-status').filter({hasText:'Learner work saved'}).waitFor();await page.reload();
  await id('map-unavailable').waitFor();
  await id('editor-tools').evaluate(el=>el.open=true);
  const [file]=await Promise.all([page.waitForEvent('download'),id('download-source').click()]);
  assert.equal(await readFile(await file.path(),'utf8'),starter+'# my exact source\n');
});

test('the retired player leaves the first lesson, its seven text stages and every other recording available',async t=>{
  const release=JSON.parse(await readFile(new URL('../dist/release.json',import.meta.url),'utf8'));
  assert.equal(release.files.filter(f=>f.path.startsWith('media/first-value/')).length,0);
  for(const lesson of Object.keys(lessons).filter(s=>s!=='first-value'))
    for(const name of ['walkthrough.mp4','poster.webp','captions.vtt'])assert.ok(release.files.some(f=>f.path==='media/'+lesson+'/'+name));
  const url=await serveBuild(t), browser=await launchChromium(t), page=await browser.newPage();
  await page.goto(url+'#lesson/first-value');await page.locator('#walkthrough > summary').press('Enter');
  assert.equal(await page.locator('video').count(),0);
  assert.equal(await page.locator('#walkthrough-transcript h3:visible').count(),7);
  await page.locator('#trace-step').selectOption('6');
  assert.deepEqual(await page.locator('[data-value]').allTextContents(),['[0]','[42]','[42]']);
});
