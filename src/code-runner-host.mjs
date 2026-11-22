// Copyright © 2026 Christopher Snow.
import {CodeRunner} from './code-runner.mjs';
import {idleChoices,idleMinutes,idlePreference,introPreference,wasmSize,elapsedTime} from './code-runner-settings.mjs';
let embedded=false;try{embedded=Boolean(frameElement?.hasAttribute('data-kernel-workbench'));}catch{}
if(!embedded&&!window.cudaPythonCodeRunner) {
  let minutes=idleMinutes(null);try{minutes=idleMinutes(localStorage.getItem(idlePreference));}catch{}
  const runner=new CodeRunner({idleMs:minutes*60_000,makeWorker:()=>new Worker(new URL('./run-worker.mjs',import.meta.url),{type:'module'})});runner.configure('',{});window.cudaPythonCodeRunner=runner;dispatchEvent(new Event('cuda-python-lab:runner-ready'));
  const actions=document.querySelector('.site-nav')??document.querySelector('main>header');
  if(actions) {
    const button=document.createElement('button');button.type='button';button.className='button';button.id='code-runner-open';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','code-runner-dialog');button.setAttribute('popovertarget','code-runner-dialog');button.setAttribute('aria-expanded','false');
    button.append('Code runner');const status=document.createElement('span');status.id='code-runner-summary';button.append(status);actions.prepend(button);
    const panel=document.createElement('section');panel.id='code-runner-dialog';panel.className='code-runner-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','code-runner-title');panel.setAttribute('popover','auto');
    const native='showPopover' in panel;if(!native)panel.hidden=true;
    panel.innerHTML=`<div class="runner-heading"><h2 id="code-runner-title">Code runner</h2><button type="button" data-runner-close>Close</button></div>
<p data-runner-status role="status"></p>
<dl class="runner-measures"><div><dt><abbr title="WebAssembly">WASM</abbr> memory allocated</dt><dd data-runner-memory>0.0 MiB</dd></div><div><dt>Last compile and run</dt><dd data-runner-time>No completed run</dd></div></dl>
<p class="runner-measure-note">Memory is the last reported allocation, excluding other browser memory. Time includes startup, compilation and simulation.</p>
<label class="runner-timeout" for="code-runner-timeout">Keep ready between runs <select id="code-runner-timeout" aria-describedby="runner-timeout-help">${idleChoices.map(value=>`<option value="${value}">${value} minutes</option>`).join('')}</select></label>
<p class="runner-setting-note" id="runner-timeout-help">Frees memory after this time without a run. Saved in this browser.</p>
<div class="runner-actions"><button type="button" data-runner-start>Start code runner</button><button type="button" data-runner-stop>Stop run</button><button type="button" data-runner-free>Free memory</button></div>
<p class="runner-setting-note">Stopping keeps your code and results.</p>`;
    panel.querySelectorAll('button').forEach(button=>button.classList.add('button'));document.body.append(panel);const timeout=panel.querySelector('select');let returnFocus=button,settingSaved=true;
    const opened=()=>native?panel.matches(':popover-open'):!panel.hidden;
    const fit=()=>{
      if(!opened())return;
      const anchor=button.getBoundingClientRect(),height=window.visualViewport?.height??innerHeight;
      panel.style.top=Math.min(anchor.bottom+8,Math.max(8,height-panel.offsetHeight-8))+'px';
      panel.style.left=Math.max(8,Math.min(anchor.right-panel.offsetWidth,innerWidth-panel.offsetWidth-8))+'px';
    };
    const close=(restore=false)=>{
      if(opened()){if(native)panel.hidePopover();else panel.hidden=true;}
      button.setAttribute('aria-expanded','false');
      if(restore)(returnFocus?.isConnected&&!returnFocus.closest('[hidden]')?returnFocus:button).focus({preventScroll:true});
    };
    runner.openControls=()=>{
      if(opened())return;
      returnFocus=document.activeElement;
      if(returnFocus?.tagName==='IFRAME')try{returnFocus=returnFocus.contentDocument.activeElement;}catch{}
      if(native)panel.showPopover();else panel.hidden=false;
      button.setAttribute('aria-expanded','true');fit();panel.querySelector('[data-runner-close]').focus({preventScroll:true});
    };
    button.addEventListener('click',event=>{event.preventDefault();opened()?close(true):runner.openControls();});
    panel.querySelector('[data-runner-close]').addEventListener('click',()=>close(true));
    panel.addEventListener('toggle',()=>button.setAttribute('aria-expanded',String(opened())));
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opened()){event.preventDefault();close(panel.contains(document.activeElement));}});
    document.addEventListener('pointerdown',event=>{if(!native&&opened()&&!panel.contains(event.target)&&!button.contains(event.target))close();});
    // Pointer events inside an editor iframe do not reach the parent popover.
    addEventListener('blur',()=>setTimeout(()=>{if(opened()&&document.activeElement?.tagName==='IFRAME')close();},0));
    addEventListener('resize',fit);addEventListener('scroll',fit,{passive:true});
    addEventListener('cuda-python-lab:lesson-changed',()=>close());
    panel.querySelector('[data-runner-start]').addEventListener('click',()=>runner.start());
    panel.querySelector('[data-runner-stop]').addEventListener('click',()=>runner.release(runner.job?.preparing&&!runner.pending?'Startup stopped.':'Run stopped. Your code and previous results are kept.'));
    panel.querySelector('[data-runner-free]').addEventListener('click',()=>runner.release());
    timeout.addEventListener('change',()=>{
      const value=Number(timeout.value);if(!idleChoices.includes(value))return;
      settingSaved=true;try{localStorage.setItem(idlePreference,String(value));}catch{settingSaved=false;}
      runner.setIdleMinutes(value);
    });
    addEventListener('storage',event=>{if(event.key===idlePreference||event.key===null){settingSaved=true;runner.setIdleMinutes(idleMinutes(event.newValue));}});
    const intro=document.createElement('dialog');intro.id='code-runner-intro-dialog';intro.setAttribute('aria-labelledby','runner-intro-title');intro.setAttribute('aria-describedby','runner-intro-purpose runner-intro-policy');
    intro.innerHTML=`<h2 id="runner-intro-title" tabindex="-1" autofocus>Code runs on your device</h2>
<p id="runner-intro-purpose">The compiler and GPU simulator use this device’s CPU and memory. Keeping them ready avoids starting them again between lessons.</p>
<p id="runner-intro-policy">The runner stops after <span data-intro-minutes></span> minutes without a run. Use <strong>Code runner</strong> in the header to change the time or free memory sooner. Your code and results are kept.</p>
<p class="runner-setting-note" data-intro-status role="status"></p>
<div class="runner-actions"><button type="button" class="primary" data-intro-back>Back to lesson</button><button type="button" data-intro-settings>Runner settings</button></div>`;
    intro.querySelectorAll('button').forEach(button=>button.classList.add('button'));document.body.append(intro);let introShown=false,introAcknowledged=false,introPreparation=false,introReturnFocus=button;
    try{introAcknowledged=localStorage.getItem(introPreference)==='1';}catch{}
    const dismissIntro=(settings=false)=>{
      introAcknowledged=true;try{localStorage.setItem(introPreference,'1');}catch{}
      intro.close();
      if(settings){button.focus({preventScroll:true});runner.openControls();}
      else (introReturnFocus?.isConnected?introReturnFocus:button).focus({preventScroll:true});
    };
    intro.querySelector('[data-intro-back]').addEventListener('click',()=>dismissIntro());
    intro.querySelector('[data-intro-settings]').addEventListener('click',()=>dismissIntro(true));
    intro.addEventListener('keydown',event=>{
      if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
      const first=intro.querySelector('[data-intro-back]'),last=intro.querySelector('[data-intro-settings]'),active=document.activeElement;
      if(event.shiftKey&&(active===first||active===intro.querySelector('h2'))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
    });
    intro.addEventListener('cancel',event=>{event.preventDefault();dismissIntro();});
    const names={stopped:'Stopped',starting:'Starting',compiling:'Compiling',running:'Running',ready:'Ready'};
    const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
    const render=()=>{
      text(status,names[runner.state]);button.dataset.state=runner.state;
      text(panel.querySelector('[data-runner-status]'),runner.reason||names[runner.state]+'…');
      text(panel.querySelector('[data-runner-memory]'),wasmSize(runner.wasmBytes));
      text(panel.querySelector('[data-runner-time]'),elapsedTime(runner.lastRunMs));
      timeout.value=String(runner.idleMs/60_000);
      text(panel.querySelector('#runner-timeout-help'),settingSaved?'Frees memory after this time without a run. Saved in this browser.':'Applies to this tab. The browser could not save this setting.');
      panel.querySelector('[data-runner-start]').hidden=runner.state!=='stopped';
      panel.querySelector('[data-runner-start]').disabled=!runner.config;
      panel.querySelector('[data-runner-stop]').hidden=!runner.busy;
      panel.querySelector('[data-runner-stop]').textContent=runner.job?.preparing&&!runner.pending?'Stop startup':'Stop run';
      panel.querySelector('[data-runner-free]').hidden=runner.state!=='ready';
      text(intro.querySelector('[data-intro-minutes]'),String(runner.idleMs/60_000));
      const introStatus=runner.busy
        ? runner.job?.preparing&&!runner.pending?'Preparing the compiler and GPU simulator. This does not run your program.':'Your run continues while this dialog is open.'
        : introPreparation&&!runner.completedRuns
          ? runner.state==='ready'?'The runner is ready. Choose Back to lesson, then Run in an editor.':runner.reason
          : 'Return to the lesson to inspect the result or execution message.';
      text(intro.querySelector('[data-intro-status]'),introStatus);
      if(runner.job&&!introAcknowledged&&!introShown){
        // Another open tab may have acknowledged the introduction since this one loaded.
        try{introAcknowledged=localStorage.getItem(introPreference)==='1';}catch{}
        if(introAcknowledged){fit();return;}
        introShown=true;introPreparation=Boolean(runner.job.preparing);introReturnFocus=document.activeElement;
        if(introReturnFocus===document.body||panel.contains(introReturnFocus))introReturnFocus=button;
        if(introReturnFocus?.tagName==='IFRAME')try{introReturnFocus=introReturnFocus.contentDocument.querySelector('#source')??button;}catch{introReturnFocus=button;}
        close();intro.showModal();
      }
      fit();
    };
    runner.addEventListener('change',render);render();
  }
  addEventListener('focus',()=>runner.checkIdle());document.addEventListener('visibilitychange',()=>runner.checkIdle());
  addEventListener('pagehide',()=>runner.release());
  addEventListener('cuda-python-lab:before-restart',event=>{if(runner.busy)event.detail.reason='Wait for the code runner to finish, or use Stop run in Code runner, then try again.';});

}
