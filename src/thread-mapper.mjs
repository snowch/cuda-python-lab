import {coverage,locateThread,mapPrediction,vectorPrograms} from './thread-map-model.mjs';
import {mountSteps} from './step-controller.mjs';

export const mapperMarkup=`<section class="value-trace thread-map" aria-labelledby="trace-title">
  <header><h2 id="trace-title" tabindex="-1">Which thread writes this element?</h2>
    <p>A launch groups threads into blocks. A block is a group in your code. A streaming multiprocessor (SM) is hardware that can run a block. This map shows logical indices. It cannot tell which SM ran a block or how long it took.</p></header>
  <p id="map-identity"></p><p id="map-unavailable" hidden>The open Python is outside this map. You can still edit, predict and run it. Use the workbench’s preparation or restore controls to reopen a supported program.</p>
  <div id="map-body">
    <label for="map-step">Investigation step</label><select id="map-step" data-step-select></select>
    <p id="map-narrative" aria-live="polite"></p>
    <div class="map-selectors"><label>Inspect a launched thread<select id="map-thread"></select></label>
      <label>Inspect an array element<select id="map-element"></select></label></div>
    <p>Each slot is one launched thread. The outline marks your selection. At the guard step, striped slots skip the write.</p>
    <div id="map-blocks" role="group" aria-label="Launch grid by block"></div>
    <p id="map-counts"></p>
    <div id="map-inspection" aria-live="polite" aria-atomic="true">
      <p id="map-equation"></p><p id="map-guard"></p>
      <table id="map-cells" hidden><caption>Selected element · source-level model</caption>
        <thead><tr><th scope="col">Input a</th><th scope="col">Input b</th><th scope="col">Output</th></tr></thead>
        <tbody><tr><td></td><td></td><td></td></tr></tbody></table>
    </div>
    <button class="button trace-line" id="map-line" type="button"></button>
    <div class="actions"><button class="button" data-prev type="button">Previous step</button><button class="button primary" data-next type="button">Next step</button><button class="button" data-restart type="button">Restart steps</button></div>
    <button class="trace-link" id="map-predict" type="button">Write a prediction</button>
    <details id="map-inputs"><summary>Change the launch and test a missing write</summary>
      <ol><li>Choose a 33-element starter case in the workbench. Compare 2 × 32 with 3 × 16. Apply each launch, predict the owner of element 32 and run it.</li>
      <li>Try 1 × 32. Choose opposite last inputs so their sum is zero. Start output at zero, apply and run. Can the printed zero alone prove a write?</li>
      <li>Keep that launch and those inputs. Start output at −1, a marker outside the expected sums. Apply and run. Then change only the launch to 2 × 32 and repeat. Compare the last values.</li></ol>
      <div class="map-selectors"><label>Launch · blocks × threads per block<select id="map-launch"></select></label>
      <label>Last input pair<select id="map-pair"><option value="starter">Starter values</option><option value="cancel">Opposite values (sum zero)</option></select></label>
      <label>Initial output per element<select id="map-initial"><option value="0">0</option><option value="-1">−1 (sentinel)</option></select></label></div>
      <p id="map-preview"></p><button class="button" type="button" id="map-apply">Apply edits to Python</button>
      <p>The preview changes this case’s host code only when you apply it. Undo preparation can reopen your previous program.</p>
      <button type="button" class="trace-link" id="map-undo" hidden>Review undo scope</button>
    </details>
    <div class="trace-observed"><strong>Execution evidence</strong><p id="map-observed"></p></div>
  </div><button class="trace-link" type="button" id="map-console">Inspect Console</button>
</section>`;

export function mountThreadMapper({root,starter,fixture,source,runState,canApply,apply,undoControl,onPredictionContext,reveal,predict,consoleFocus}) {
  const el=id=>root.querySelector('#'+id);
  const thread=el('map-thread'), element=el('map-element'), launch=el('map-launch'), pair=el('map-pair'), initial=el('map-initial');
  let current, programs, caseId, lastText, phase=0, selection='element', index=0;
  const steps=['Predict the last element','Find its owner','Test the bounds check','Follow the write'];
  const controller=mountSteps(root,steps,i=>{phase=i;if(current)render();});
  function choose(kind,i) { selection=kind;index=i;render(); }
  thread.oninput=()=>{if(thread.value!=='')choose('thread',Number(thread.value));};
  element.oninput=()=>{if(element.value!=='')choose('element',Number(element.value));};

  function setChoices() {
    const {n,blocks,width}=current;
    launch.replaceChildren(...(n===33?['2 × 32','3 × 16','1 × 32']:['1 × 32']).map(label=>new Option(label,label)));
    launch.value=blocks+' × '+width;pair.value=current.cancel?'cancel':'starter';initial.value=String(current.initial);
    thread.replaceChildren(new Option('No launched owner',''));
    for(let i=0;i<blocks*width;i++)thread.add(new Option('Block '+Math.floor(i/width)+' · thread '+(i%width),String(i)));
    element.replaceChildren(new Option('Outside the array',''));
    for(let i=0;i<n;i++)element.add(new Option('out['+i+']',String(i)));
    thread.options[0].disabled=true;element.options[0].disabled=true;
    const grid=el('map-blocks');grid.replaceChildren();
    for(let b=0;b<blocks;b++) {
      const row=document.createElement('button');row.type='button';row.className='map-block';
      row.setAttribute('aria-label','Inspect first thread in block '+b);
      const label=document.createElement('strong');label.textContent='Block '+b;
      const strip=document.createElement('span');strip.className='map-strip';strip.setAttribute('aria-hidden','true');
      strip.style.gridTemplateColumns='repeat('+width+', minmax(0, 1fr))';
      for(let local=0;local<width;local++)strip.append(document.createElement('i'));
      const range=document.createElement('small');range.textContent='i = '+(b*width)+'–'+((b+1)*width-1);
      row.append(label,strip,range);row.onclick=()=>choose('thread',b*width);grid.append(row);
    }
  }

  function observe() {
    const state=runState(), r=state.result;
    let message;
    if(state.busy)message='Running the open Python…';
    else if(state.failure)message='Runner files could not load. Open the Console for recovery.';
    else if(!r)message='Run the open Python to inspect its printed array.';
    else if(r.source!==source() || r.caseId!==caseId)message='The saved output belongs to earlier code or a different case. Run this program to compare.';
    else if(r.error || r.status!=='Ran in GPGPU-Sim.')message='No completed simulator result for this run. Inspect the Console.';
    else {
      const match=/^out = (\[[^\n]*\])$/.exec(r.output);
      let values;
      try { if(match)values=JSON.parse(match[1]); } catch { /* Leave unexpected output in the Console. */ }
      if(!Array.isArray(values)||values.length!==current.n||!values.every(Number.isFinite))message='Open the Console to inspect the printed output.';
      else if(index>=current.n)message='The simulator printed '+values.length+' elements. Index '+index+' is outside that array.';
      else {
        const cell=locateThread(current,selection,index);
        message='GPGPU-Sim printed out['+index+'] = '+values[index]+'. The input sum is '+cell.expected+'. ';
        if(cell.guard===null) {
          message+='No thread covers this index in the open launch. ';
          message+=values[index]===cell.expected?'The unchanged initial value matches the sum, so a numerical comparison would pass.':'The unchanged initial value differs from the sum.';
        }
        else message+='The source maps this element to block '+cell.block+', thread '+cell.local+'.';
      }
    }
    el('map-observed').textContent=message;
  }

  function render() {
    const p=current,c=coverage(p),cell=locateThread(p,selection,index),b=cell.block,t=cell.local;
    thread.value=b===null?'':String(index);element.value=cell.element===null?'':String(index);
    for(const [block,row] of [...el('map-blocks').children].entries()) {
      row.classList.toggle('map-selected',block===b);
      row.setAttribute('aria-pressed',String(block===b));
      for(const [local,dot] of [...row.querySelectorAll('i')].entries()) {
        const i=block*p.width+local;
        dot.className=(phase>=2 && i>=p.n?'skip ':'')+(i===index?'selected':'');
      }
    }
    const lines=[p.launch,'i = cuda.grid(1)','if i < n:','out[i] = a[i] + b[i]'];
    const instruction=[mapPrediction(p).question,'blockIdx.x is the block number, blockDim.x is its thread count, and threadIdx.x is the local thread number. Both indices start at zero. Select an element or a thread to follow either direction.',
      'A thread enters the guard only when its index is smaller than the array length.',
      'Trace both reads and the output cell. Compare your prediction with a run of this program.'];
    el('map-narrative').textContent=instruction[phase];
    el('map-counts').textContent=c.launched+' launched'+(phase>=2?' · '+c.active+' active · '+c.skipped+' skip the store · '+c.covered+' elements covered · '+c.uncovered+' uncovered':'. Each strip shows one block. Select a block to inspect its first thread.');
    const eq=el('map-equation');
    eq.textContent=phase===0?'Selected '+(selection==='thread'?'thread index ':'array index ')+index+'. Advance to inspect the calculation.':
      b===null?'Element '+index+' has no launched owner. The largest launched index is '+(c.launched-1)+'.':
      'cuda.grid(1) = blockIdx.x × blockDim.x + threadIdx.x = '+b+' × '+p.width+' + '+t+' = '+index+'. '+(selection==='element'?'Dividing '+index+' by '+p.width+' gives block '+b+' and remainder '+t+' (the local thread).':'');
    el('map-guard').textContent=phase<2?'':b===null?'No thread evaluates the guard for this element.':
      index+' < '+p.n+' is '+(cell.guard?'true. This thread enters the if block.':'false. This launched thread skips both reads and the store.');
    const table=el('map-cells');table.hidden=phase!==3;
    if(phase===3) {
      const cells=table.querySelectorAll('td');
      cells[0].textContent=cell.element===null?'No read':'a['+index+'] = '+cell.a+(cell.guard?' · read':' · unread');
      cells[1].textContent=cell.element===null?'No read':'b['+index+'] = '+cell.b+(cell.guard?' · read':' · unread');
      cells[2].textContent=cell.guard?'out['+index+'] ← '+cell.expected:b===null?'out['+index+'] stays '+p.initial:'No destination';
    }
    el('map-line').textContent='Show source · '+lines[phase];
    el('map-line').onclick=()=>reveal(lines[phase]);
    observe();
  }

  function proposal() {
    return [...programs.values()].find(v=>v.blocks+' × '+v.width===launch.value && v.cancel===(pair.value==='cancel') && v.initial===Number(initial.value));
  }
  function preview() {
    if(!current)return;
    const next=proposal(), changes=[];
    if(next && next.launch!==current.launch)changes.push(next.launch);
    if(next && next.cancel!==current.cancel)changes.push((next.cancel?'Insert before b = cuda.to_device(b_host): ':'Remove: ')+next.adjust);
    if(next && next.initial!==current.initial)changes.push(next.init);
    el('map-preview').textContent=changes.length?changes.join('\n'):'Controls match the open Python.';
    el('map-apply').disabled=!changes.length || !canApply();
    if(changes.length && el('map-apply').disabled)el('map-preview').textContent+='\nWait for a confirmed save or review save and recovery options.';
    el('map-undo').hidden=undoControl.hidden;
  }
  for(const control of [launch,pair,initial])control.oninput=preview;
  el('map-apply').onclick=async()=>{
    const next=proposal();
    if(!current||!next||current.source!==source()||!canApply())return;
    if(await apply(next.source,true) && root.isConnected && [document.body,el('map-apply')].includes(document.activeElement))el('map-step').focus();
  };
  el('map-undo').onclick=()=>undoControl.focus();
  el('map-predict').onclick=predict;el('map-console').onclick=consoleFocus;
  function update() {
    const text=source(), f=fixture(), changed=f.id!==caseId;
    if(changed){caseId=f.id;programs=vectorPrograms(starter(),f);}
    if(changed || text!==lastText) {
      lastText=text;current=programs.get(text);
      el('map-body').hidden=!current;el('map-unavailable').hidden=Boolean(current);
      el('map-identity').textContent='Starter case · '+f.label+(current?' | Open Python · '+current.n+' elements · '+current.blocks+' × '+current.width+' · initial output '+current.initial:' | Custom Python');
      onPredictionContext(mapPrediction(current));
      if(current){index=current.n-1;selection='element';setChoices();controller.reset();}
    }
    if(current){preview();observe();}
  }
  update();
  return {update};
}
