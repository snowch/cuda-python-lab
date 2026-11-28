import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
import {lessons} from '../../../src/course.mjs';

const out=process.env.EVIDENCE_DIR, books=process.env.BOOK_DIR;
if (!out || !books) throw Error('Set EVIDENCE_DIR and BOOK_DIR to the capture and notebook directories.');
const cleanup=[], t={after:fn=>cleanup.unshift(fn),diagnostic:console.log};
await mkdir(out,{recursive:true}); await mkdir(books,{recursive:true});
try {
  const base=await serveBuild(t),browser=await launchChromium(t),context=await browser.newContext({acceptDownloads:true,permissions:["clipboard-read","clipboard-write"]});
  const page=await context.newPage();
  for (const [slug,lesson] of Object.entries(lessons)) {
    await page.goto(base+'#lesson/'+slug);
    await page.getByRole("heading",{name:lesson.title,exact:true}).waitFor();
    const editor=page.getByRole('textbox',{name:'Python program source'});
    await editor.waitFor();
    if (slug==='softmax') await page.locator('#guided-task').selectOption('lane');
    if (slug==='precision') {
      await page.locator('#guided-task').selectOption('regroup');
      await editor.press('Control+a'); await editor.press('Control+c');
      const starter=await page.evaluate(()=>navigator.clipboard.readText());
      assert.ok(starter.includes('actual = main()'));
      await page.keyboard.insertText(starter.replace('a[i] + b[i]','a[i] + c[i]').replace('first + c[i]','first + b[i]'));
    }
    const [file]=await Promise.all([page.waitForEvent('download'),page.locator('#download-notebook').click({delay:200})]);
    const source=await readFile(await file.path(),'utf8'), book=JSON.parse(source);
    const cases=new Set(book.cells.flatMap(c=>c.metadata.cuda_lab ? [c.metadata.cuda_lab.case] : []));
    assert.equal(cases.size,lesson.cases.length);
    await writeFile(join(books,file.suggestedFilename()),source);
    console.log('Downloaded',file.suggestedFilename(),[...cases].join(', '));
  }
  for (const width of [390,1440]) for (const theme of ['light','dark']) {
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({colorScheme:theme});
    await page.goto(base+'#lesson/precision');
    await page.locator('#editor-tools').evaluate(el=>el.open=true);
    await page.locator('#download-notebook').evaluate(el=>el.scrollIntoView({block:'center'}));
    assert.ok(await page.locator('#backup-work').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`export-${width}-${theme}.png`)});
    await page.goto(base+'#gpu');
    await page.getByRole('heading',{name:'Open and run a lab notebook'}).evaluate(el=>el.scrollIntoView({block:'center'}));
    await page.screenshot({path:join(out,`setup-${width}-${theme}.png`)});
  }
} finally {for (const fn of cleanup) await fn();}
