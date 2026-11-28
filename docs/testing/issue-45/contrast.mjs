import assert from 'node:assert/strict';
import {launchChromium,serveBuild} from '../../../tests/browser-support.mjs';
const clean=[],t={after:f=>clean.unshift(f),diagnostic:console.log};
try{
  const options=process.env.COURSE_DIST ? {directory:new URL(process.env.COURSE_DIST)} : {};
  const url=await serveBuild(t,options),browser=await launchChromium(t),page=await browser.newPage();
  await page.goto(url+'#lesson/softmax');await page.locator('#guided-task').selectOption('lane');
  await page.locator('#prediction').fill('Lane 0 writes columns 0 and 32.');
  for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme});
    await page.waitForFunction(v=>document.documentElement.dataset.theme===v,theme);
    const colors=await page.locator('#prediction').evaluate(el=>{
      const s=getComputedStyle(el);
      return {text:s.color,background:s.backgroundColor,opacity:s.opacity};
    });
    const luminance=color=>{
      const rgb=color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
      assert.ok(rgb,'Requires an opaque sRGB color: '+color);
      return rgb.slice(1).map(v=>Number(v)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
        .reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
    };
    assert.equal(colors.opacity,'1');
    const a=luminance(colors.text),b=luminance(colors.background);
    const contrast=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    console.log(theme,JSON.stringify(colors),'text contrast',contrast.toFixed(2)+':1');
    assert.ok(contrast>=4.5);
  }
}finally{for(const f of clean)await f();}
