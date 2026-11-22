import "./code-runner-host.mjs";
import {saveReadingState} from './experiment-state.mjs';
const manager = window.cudaPythonCodeRunner;

// Lesson views own their saved results, while the reading window owns the worker.
export function attachRunner(root, { getSource, filename, getResult=()=>null, saveResult=()=>{} }) {
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
    status.textContent=loadFailure?loadFailure.status:result ? result.source===getSource() ? result.status : 'Previous run shown. Run the edited program to update the result.' : '';
    recovery.hidden=!loadFailure;run.classList.toggle('primary',!loadFailure);
    root.querySelector('#runtime-error').textContent=loadFailure?.output??'';
    root.querySelector('#runtime-previous-note').hidden=!loadFailure||!saved?.output;
  }
  function setBusy(value) {
    busy=value;run.disabled=value;stop.hidden=!value;
    if (!value&&document.activeElement===stop) run.focus();
  }
  function start() {
    if(busy)return;
    const source=getSource();loadFailure=null;recovery.hidden=true;run.classList.add('primary');setBusy(true);status.classList.remove('error');status.textContent='Starting…';
    manager.execute(client,'',{source,filename},reply=>{
      if(reply.stage&&!reply.cancelled){status.textContent=reply.stage;return;}
      setBusy(false);
      if(reply.cancelled){display();status.textContent=reply.stage;return;}
      result={source,output:[reply.stdout?.trimEnd(),reply.error].filter(Boolean).join('\n\n'),ptx:reply.ptx??'',error:Boolean(reply.error),status:reply.runtimeLoad?'Code runner files could not be loaded.':reply.error?'Execution stopped with an error.':reply.launched?'Ran in GPGPU-Sim.':'Python finished without a CUDA launch.'};
      if(reply.runtimeLoad)loadFailure=result;else saveResult(result);display();
    });
  }
  function reset() { manager.detach(client);display(); }
  run.addEventListener('click',start);
  stop.addEventListener('click',()=>manager.detach(client));
  reload.addEventListener('click',()=>{
    try{
      saveReadingState();const url=new URL(location.href);url.searchParams.delete('gpu-release');url.searchParams.delete('download');
      if(url.href===location.href)location.reload();else location.assign(url.href);
    }catch(error){root.querySelector('#runtime-recovery-note').textContent='Reload cancelled: '+error.message+' Export .py in Editor tools before reloading if browser storage is unavailable.';}
  });
  display();
  return {start,reset,dispose:()=>manager.detach(client)};
}
