import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {firstValuePrograms,firstValueStep,stages} from '../src/first-value-model.mjs';
import {lessons} from '../src/course.mjs';
import {standaloneProgram} from '../src/host-program.mjs';
import {launchChromium,reviewPreparation,serveBuild} from './browser-support.mjs';

const starter=standaloneProgram(await readFile(new URL('../src/kernels/first-value.py',import.meta.url),'utf8'),lessons['first-value'].cases[0]);

test('each supported complete program models three separate arrays at each source line',()=>{
  const programs=firstValuePrograms(starter);
  assert.equal(programs.size,8);
  for(const [source,{host,store,printed}] of programs){
    assert.ok(source.includes(host===0?'np.zeros(1, dtype=np.float32)':'np.array([5], dtype=np.float32)'));
    assert.ok(source.includes('out[0] = '+store));
    assert.equal(source.includes('print(out_host.tolist())'),printed);
    const expected=[[null,null,null],[host,null,null],[host,host,null],[host,host,null],[host,host,null],
      [host,store,null],[host,store,store],[host,store,store]];
    assert.equal(stages.length,expected.length);
    expected.forEach((values,i)=>{
      const step=firstValueStep(programs.get(source),i);
      assert.deepEqual(step.values,values);
      assert.equal(source.split('\n')[step.line-1].trim(),step.anchor);
    });
  }
  assert.equal(programs.has(starter+'# custom\n'),false);
  assert.equal(programs.has(starter.replace('kernel[1, 1]','kernel[2, 1]')),false);
});

test('the task, source, prediction, patch and undo stay connected on a phone',async t=>{
  const url=await serveBuild(t), browser=await launchChromium(t);
  const page=await browser.newPage({viewport:{width:320,height:850},reducedMotion:'reduce'});
  await page.goto(url+'#lesson/first-value');
  const select=page.locator('#guided-task');
  await select.selectOption('host');
  const action=await page.locator('#task-action').innerText();
  assert.equal(await page.getByText(action,{exact:true}).count(),1);
  await page.locator('#change-task').click();
  assert.equal(await page.locator(':focus').getAttribute('id'),'guided-task');
  await page.locator('#trace-predict').press('Enter');
  const note='Host 0, store 42, print result only: original 0, device 42, copy 42.';
  const question=page.locator('#prediction-prompt');
  async function checkComparisonLink() {
    assert.equal(await page.getByText(await question.innerText(),{exact:true}).count(),1);
    await page.locator('#compare-prediction').press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'),'prediction');
    assert.ok((await page.locator('#prediction').getAttribute('aria-describedby')).split(' ').includes('prediction-prompt'));
  }
  assert.match(await question.innerText(),/host starts at 0.*kernel stores 42.*out_host.*out.*result/);
  await checkComparisonLink();
  assert.match(await page.locator('#prediction-evidence').innerText(),/prints only result.*print\(out_host/);
  await page.keyboard.type(note);
  await checkComparisonLink();
  assert.equal(await page.locator('#prediction').inputValue(),note);
  await page.locator('#trace-inputs summary').click();
  await page.locator('#trace-host').selectOption('5');
  await page.locator('#trace-store').selectOption('73');
  await page.locator('#trace-print').selectOption('both');
  const preview=await page.locator('#trace-diff').innerText();
  assert.match(preview,/np.array\(\[5\]/);assert.match(preview,/out\[0\] = 73/);
  assert.match(await question.innerText(),/host starts at 0.*kernel stores 42/);
  await page.locator('#trace-apply').click();
  await page.locator('#trace-identity').filter({hasText:'host 5 · store 73'}).waitFor();
  assert.match(await question.innerText(),/host starts at 5.*kernel stores 73/);
  await checkComparisonLink();
  assert.match(await page.locator('#trace-narrative').innerText(),/5 on the host and store 73 on the device/);
  assert.match(await page.locator('#prediction-evidence').innerText(),/prints result, then out_host.*device value/);
  assert.match(await page.locator('#notes-scope').innerText(),/earlier runs/);
  assert.equal(await page.locator('#prediction').inputValue(),note);
  await page.locator('#trace-step').selectOption('6');
  assert.deepEqual(await page.locator('[data-value]').allTextContents(),['[5]','[73]','[73]']);
  await page.locator('[data-buffer="2"]').press('Enter');
  assert.match(await page.locator('#trace-inspection').innerText(),/second CPU array.*index 0 is 73/);
  assert.equal(await page.locator('[data-buffer="2"] [data-role]').innerText(),'Created');
  await page.locator('[data-prev]').press('Enter');
  assert.match(await page.locator('#trace-inspection').innerText(),/does not exist/);
  await page.locator('[data-next]').press('Enter');
  await page.locator('#trace-line').press('Enter');
  assert.equal(await page.evaluate(()=>getSelection().toString()),'result = out.copy_to_host()');
  await page.keyboard.press('Escape');await page.keyboard.press('Tab');
  assert.equal(await page.locator(':focus').getAttribute('id'),'run');
  await reviewPreparation(page);await page.locator('#undo-prepare').click();
  await page.locator('#trace-identity').filter({hasText:'host 0 · store 42'}).waitFor();
  assert.match(await question.innerText(),/host starts at 0.*kernel stores 42/);
  const editor=page.getByRole('textbox',{name:'Python program source'});
  await editor.press('Control+a');await page.keyboard.insertText(starter+'# independent draft\n');
  await page.locator('#trace-unavailable').waitFor();
  assert.equal(await page.locator('#trace-stages').isVisible(),false);
  await page.locator('#work-status').filter({hasText:'Learner work saved'}).waitFor();
  await page.reload();await page.locator('#trace-unavailable').waitFor();
  assert.match(await question.innerText(),/open program to print/);
  await checkComparisonLink();
  assert.match(await page.locator('#prediction-evidence').innerText(),/outside the array model/);
  assert.equal(await page.locator('#prediction').inputValue(),note);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('portrait lessons present one task and prediction before the full-width editor',async t=>{
  const url=await serveBuild(t),browser=await launchChromium(t);
  const page=await browser.newPage({viewport:{width:820,height:1180}});
  for(const slug of ['first-value','vector-add','softmax']){
    await page.goto(url+'#lesson/'+slug);
    await page.locator('.cm-content').waitFor();
    const task=page.locator('#task-action'),question=page.locator('#prediction-prompt');
    assert.equal(await page.getByText(await task.innerText(),{exact:true}).count(),1);
    assert.equal(await page.getByText(await question.innerText(),{exact:true}).count(),1);
    const flow=await page.evaluate(()=>{
      const pos=id=>document.querySelector(id).getBoundingClientRect().top;
      return {
        model:document.querySelector('.value-trace')?pos('.value-trace'):null,
        task:pos('#task-action'),prediction:pos('#prediction'),code:pos('#source'),console:pos('#console-title'),
        codeWidth:document.querySelector('.cm-scroller').clientWidth,
        lessonWidth:document.querySelector('.lab-layout').clientWidth
      };
    });
    if(slug!=='softmax')assert.ok(flow.model<flow.task);
    assert.ok(flow.task<flow.prediction && flow.prediction<flow.code && flow.code<flow.console);
    assert.ok(flow.codeWidth>=flow.lessonWidth*.95);
    await page.locator('#compare-prediction').press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'),'prediction');
    const notes=page.locator('#prediction');
    await notes.fill('For the original inputs I expect the two largest probabilities to tie. After changing the exponentials I expect the finiteness check to fail. I will compare both rows and their sums.');
    assert.ok(await notes.evaluate(e=>e.scrollHeight<=e.clientHeight+1),'A short paragraph should remain readable in the answer field.');
    assert.equal(await page.locator('#program-options').evaluate(el=>el.open),false);
  }
});
