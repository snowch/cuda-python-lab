import {firstValuePrediction, firstValuePrograms, firstValueStep, stages} from './first-value-model.mjs';
import {mountSteps} from './step-controller.mjs';

export const traceMarkup = `<section class="value-trace" aria-labelledby="trace-title">
  <header><p class="trace-context">One element · source-level model</p>
    <h2 id="trace-title" tabindex="-1">Follow the value</h2>
    <p>Step through the open program, then compare the three arrays with what your code prints in GPGPU-Sim.</p></header>
  <p id="trace-unavailable" hidden>The open code is outside this model. You can still edit and run it. To reopen a known version, use the preparation or restore controls.</p>
  <div id="trace-stages">
    <p id="trace-identity"></p>
    <label for="trace-step">Program step</label><select data-step-select id="trace-step"></select>
    <p id="buffer-label">Select an array to inspect element 0.</p><div class="trace-buffers" role="group" aria-labelledby="buffer-label">${[['Original host','out_host'],['Device','out'],['Copied host','result']].map(([label,name],i)=>`<button type="button" data-buffer="${i}" aria-pressed="${i===0}"><span>${label}</span><code>${name}</code><strong data-value></strong><small data-role></small></button>`).join('')}</div>
    <p id="trace-inspection"></p>
    <div id="trace-narrative" aria-live="polite" aria-atomic="true"></div>
    <button class="button trace-line" id="trace-line" type="button"></button>
    <div class="actions"><button class="button" data-prev type="button">Previous step</button><button class="button primary" data-next type="button">Next step</button><button class="button" data-restart type="button">Restart steps</button></div>
    <button class="trace-link" id="trace-predict" type="button">Write a prediction</button>
    <details id="trace-inputs"><summary>Change the program inputs</summary>
      <div class="trace-options"><label>Original host value<select id="trace-host"><option>0</option><option>5</option></select></label>
      <label>Device store<select id="trace-store"><option>42</option><option>73</option></select></label>
      <label>Host output<select id="trace-print"><option value="result">Copied result</option><option value="both">Result and original</option></select></label></div>
      <p id="trace-diff"></p><button class="button" id="trace-apply" type="button">Apply edits to Python</button>
      <p>Applying changes the open program and saves its previous version in Undo preparation.</p><button type="button" class="trace-link" id="trace-undo" hidden>Review undo scope</button>
    </details>
    <details id="trace-memory"><summary>Where can these arrays live?</summary>
      <p>In a discrete GPU system, host RAM and GPU memory are physically separate. An integrated GPU such as Jetson can share physical DRAM with the CPU. In both systems this code creates distinct logical arrays. Copy time requires a hardware measurement.</p></details>
  </div>
  <div class="trace-observed"><strong>Execution evidence</strong><p id="trace-evidence"></p><button class="trace-link" id="trace-console" type="button">Inspect Console</button></div>
</section>`;

export function mountFirstValueTrace({root,starter,source,fixture,runState,canApply,apply,undoControl,reviewUndo,reveal,predict,consoleFocus,onPredictionContext}) {
  const programs=firstValuePrograms(starter()), el=id=>root.querySelector('#'+id);
  let current, observedSource, step, inspected=0;
  const buffers = [...root.querySelectorAll('[data-buffer]')];
  const descriptions = [
    'out_host is the original CPU array. Copying from it leaves its element intact.',
    'out is the device allocation. The kernel receives this allocation as its argument.',
    'result is a second CPU array. The copy from out creates it. The host then prints and returns it.',
  ];
  function inspectBuffer(index) {
    inspected=index;
    buffers.forEach((button,i)=>{
      button.setAttribute('aria-pressed',String(i===index));
      if(i===index)button.setAttribute('aria-describedby','trace-inspection');
      else button.removeAttribute('aria-describedby');
    });
    const value=step.values[index];
    el('trace-inspection').textContent=descriptions[index]+' '+(value===null?'It does not exist at this step.':'Its element at index 0 is '+value+'.');
  }
  for(const [i,button] of buffers.entries()) button.onclick=()=>inspectBuffer(i);
  const host=el('trace-host'), store=el('trace-store'), printed=el('trace-print');
  const proposal=()=>[...programs.values()].find(p=>p.host===Number(host.value)&&p.store===Number(store.value)&&p.printed===(printed.value==='both'));
  function preview() {
    const p=proposal();
    const changes=p&&current ? [
      ...(p.host!==current.host?[firstValueStep(p,1).anchor]:[]),
      ...(p.store!==current.store?[firstValueStep(p,5).anchor]:[]),
      ...(p.printed!==current.printed?[(p.printed?'Add ':'Remove ')+'print(out_host.tolist()) before return result']:[]),
    ]:[];
    el('trace-diff').textContent=changes.length?changes.join('\n'):'The controls match the open program.';
    const ready=canApply();
    if(changes.length && !ready) el('trace-diff').textContent+='\nWait for the current save, or review save and recovery options in the workbench.';
    el('trace-apply').disabled=!changes.length || !ready;
    el('trace-undo').hidden=undoControl.hidden;
  }
  function render(i) {
    if(!current)return;
    step=firstValueStep(current,i);
    root.querySelectorAll('[data-value]').forEach((node,k)=>{
      node.textContent=step.values[k]===null?'Not created':'['+step.values[k]+']';
      node.classList.toggle('allocated',step.values[k]!==null);
      buffers[k].querySelector('[data-role]').textContent=step.roles[k] ?? '';
      buffers[k].classList.toggle('participates',Boolean(step.roles[k]));
    });
    inspectBuffer(inspected);
    el('trace-narrative').textContent=step.context+' · '+step.explanation;
    el('trace-line').textContent='Show line '+step.line+' · '+step.anchor;
  }
  const controller=mountSteps(root,stages,render);
  function update() {
    const text=source(), state=runState(), r=state?.result;
    if(text!==observedSource){
      observedSource=text;current=fixture().id==='one'?programs.get(text):undefined;
      if(current){el('trace-identity').textContent='Open code · One element · host '+current.host+' · store '+current.store;host.value=String(current.host);store.value=String(current.store);printed.value=current.printed?'both':'result';}
      onPredictionContext(firstValuePrediction(current));
      controller.reset();
    }
    el('trace-stages').hidden=!current; el('trace-unavailable').hidden=Boolean(current);
    preview();
    const evidence=state?.busy?'Run in progress.':state?.failure?'Runner files could not load. See Console for recovery.':
      !r?'Run the open program to collect its printed output.':r.source!==text || r.caseId!==fixture().id?'The saved output is from an earlier program or case. Run again for current evidence.':
      r.error?'This execution failed. Inspect the diagnostic in the Console.':
      r.status!=='Ran in GPGPU-Sim.'?'This run has no completed simulator launch. See Console.':
      !current?'The Console shows the saved output for this custom program. Its intermediate values are outside the model.':
      'Saved GPGPU-Sim output for this program:\n'+r.output;
    const evidenceNode=el('trace-evidence');
    if(evidenceNode.textContent!==evidence)evidenceNode.textContent=evidence;
  }
  [host,store,printed].forEach(control=>control.oninput=preview);
  el('trace-apply').onclick=async()=>{
    const p=proposal();
    if(!current || !p || source()!==current.source || !canApply())return;
    if(await apply(p.source) && root.isConnected && [document.body,el('trace-apply')].includes(document.activeElement)) {
      el('trace-step').focus();
    }
  };
  el('trace-undo').onclick=reviewUndo;
  el('trace-line').onclick=()=>{if(current)reveal(step.anchor);};
  el('trace-predict').onclick=predict; el('trace-console').onclick=consoleFocus;
  update();
  return {update};
}
