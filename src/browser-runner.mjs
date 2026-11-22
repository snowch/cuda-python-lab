import "./code-runner-host.mjs";
const manager = window.cudaPythonCodeRunner;

// Lesson views own their saved results, while the reading window owns the worker.
export function attachRunner(root, { getSource, filename, getResult=()=>null, saveResult=()=>{} }) {
  const run=root.querySelector('#run'), stop=root.querySelector('#stop');
  const output=root.querySelector('#run-output'), status=root.querySelector('#run-status');
  const ptx=root.querySelector('#ptx-output'), ptxPanel=root.querySelector('#ptx-panel');
  const client={};let busy=false,result=getResult();
  function display() {
    result=getResult();
    output.textContent=result?.output??'';output.hidden=!output.textContent;
    ptx.textContent=result?.ptx??'';ptxPanel.hidden=!ptx.textContent;
    status.classList.toggle('error',Boolean(result?.error));
    status.textContent=result ? result.source===getSource() ? result.status : 'Previous run shown. Run the edited program to update the result.' : '';
  }
  function setBusy(value) {
    busy=value;run.disabled=value;stop.hidden=!value;
    if (!value&&document.activeElement===stop) run.focus();
  }
  function start() {
    if(busy)return;
    const source=getSource();setBusy(true);status.classList.remove('error');status.textContent='Starting…';
    manager.execute(client,'',{source,filename},reply=>{
      if(reply.stage&&!reply.cancelled){status.textContent=reply.stage;return;}
      setBusy(false);
      if(reply.cancelled){display();status.textContent=reply.stage;return;}
      result={source,output:[reply.stdout?.trimEnd(),reply.error].filter(Boolean).join('\n\n'),ptx:reply.ptx??'',error:Boolean(reply.error),status:reply.error?'Execution stopped with an error.':reply.launched?'Ran in GPGPU-Sim.':'Python finished without a CUDA launch.'};
      saveResult(result);display();
    });
  }
  function reset() { manager.detach(client);display(); }
  run.addEventListener('click',start);
  stop.addEventListener('click',()=>manager.detach(client));
  display();
  return {start,reset,dispose:()=>manager.detach(client)};
}
