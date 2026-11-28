// Native buttons and a step selector work without timers, animation or pointer gestures.
export function mountSteps(root, titles, render) {
  const select=root.querySelector('[data-step-select]');
  const prev=root.querySelector('[data-prev]'), next=root.querySelector('[data-next]');
  titles.forEach((title,i)=>select.add(new Option((i+1)+' / '+titles.length+' · '+title,String(i))));
  let index=0;
  function show(value) {
    index=Math.max(0,Math.min(titles.length-1,value));
    select.value=String(index);
    // Keep keyboard focus on the control at either end of the sequence.
    prev.setAttribute('aria-disabled',String(index===0));
    next.setAttribute('aria-disabled',String(index===titles.length-1));
    render(index);
  }
  select.oninput=()=>show(select.selectedIndex);
  prev.onclick=()=>{if(index>0)show(index-1);};
  next.onclick=()=>{if(index<titles.length-1)show(index+1);};
  root.querySelector('[data-restart]').onclick=()=>show(0);
  show(0);
  return {reset:()=>show(0)};
}
