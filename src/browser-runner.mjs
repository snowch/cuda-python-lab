import "./code-runner-host.mjs";
const manager = window.cudaPythonCodeRunner;

// Lesson views own their saved results, while the reading window owns the worker.
export function attachRunner(root, { getSource, getCase, filename, getResult=()=>null, saveResult=()=>{}, onDisplay=()=>{} }) {
  const run=root.querySelector('#run'), stop=root.querySelector('#stop');
  const output=root.querySelector('#run-output'), status=root.querySelector('#run-status');
  const ptx=root.querySelector('#ptx-output'), ptxPanel=root.querySelector('#ptx-panel');
  const recovery=root.querySelector('#runtime-recovery'),reload=root.querySelector('#reload-runner-files');
  const client={};let busy=false,result=getResult(),loadFailure;
  function display() {
    const saved=getResult();result=loadFailure??saved;
    const previous=loadFailure?saved:result;
    output.textContent=previous?.output??'';output.hidden=!output.textContent;
    ptx.textContent=previous?.ptx??'';ptxPanel.hidden=!ptx.textContent;
    status.classList.toggle('error',Boolean(result?.error));
    status.textContent=loadFailure?loadFailure.status:result ? result.source===getSource() && (!result.caseId || result.caseId===getCase()) ? result.status : 'Previous run shown. Run the edited program to update the result.' : '';
    recovery.hidden=!loadFailure;run.classList.toggle('primary',!loadFailure);
    root.querySelector('#runtime-error').textContent=loadFailure?.output??'';
    root.querySelector('#runtime-previous-note').hidden=!loadFailure||!saved?.output;
    onDisplay();
  }
  function setBusy(value) {
    const focused=document.activeElement;
    busy=value;
    stop.hidden=!value;
    run.disabled=value;
    if (value && focused===run) stop.focus({preventScroll:true});
    if (!value && focused===stop) run.focus({preventScroll:true});
  }
  function start() {
    if(busy)return;
    const source=getSource(), caseId=getCase();loadFailure=null;recovery.hidden=true;run.classList.add('primary');setBusy(true);status.classList.remove('error');status.textContent='Starting…';onDisplay();
    manager.execute(client,'',{source,filename},reply=>{
      if(reply.stage&&!reply.cancelled){status.textContent=reply.stage;return;}
      setBusy(false);
      if(reply.cancelled){display();status.textContent=reply.stage;return;}
      result={source,caseId,output:[reply.stdout?.trimEnd(),reply.error].filter(Boolean).join('\n\n'),ptx:reply.ptx??'',error:Boolean(reply.error),status:reply.runtimeLoad?'Code runner files could not be loaded.':reply.error?'Execution stopped with an error.':reply.launched?'Ran in GPGPU-Sim.':'Python finished without a CUDA launch.'};
      if(reply.runtimeLoad)loadFailure=result;else saveResult(result);display();
    });
  }
  function reset() { manager.detach(client);display(); }
  run.addEventListener('click',start);
  stop.addEventListener('click',()=>manager.detach(client));
  reload.addEventListener('click',()=>manager.reloadLesson());
  display();
  return {start,reset,read:()=>({busy,failure:Boolean(loadFailure),result}),dispose:()=>manager.detach(client)};
}
