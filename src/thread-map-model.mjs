// The launch is one-dimensional. Each launched thread can visit exactly one index
// in this kernel. A grid-stride kernel would need a different rule for its visits.
export function coverage({n,blocks,width}) {
  const launched=blocks*width, covered=Math.min(n,launched);
  return {launched,active:covered,skipped:launched-covered,covered,uncovered:n-covered};
}

export function locateThread(program,kind,index) {
  const {n,blocks,width,a,b,initial}=program;
  const launched=blocks*width;
  if (!['thread','element'].includes(kind) || !Number.isInteger(index) ||
      index<0 || index>=(kind==='element'?n:launched)) throw new RangeError('Selection outside the launch or array');
  const exists=index<launched, inArray=index<n, writes=exists && inArray;
  return {index,block:exists?Math.floor(index/width):null,local:exists?index%width:null,
    element:inArray?index:null,guard:exists?writes:null,
    a:inArray?a[index]:null,b:inArray?b[index]:null,
    expected:inArray?a[index]+b[index]:null,modeled:inArray?(writes?a[index]+b[index]:initial):null};
}

export function vectorPrograms(starter,fixture) {
  const programs=new Map(), n=fixture.scalars.n;
  const launches=n===33?[[2,32],[3,16],[1,32]]:[[1,32]];
  const oldLaunch='kernel['+fixture.blocks[0]+', '+fixture.threads[0]+']';
  for (const [blocks,width] of launches) for (const cancel of [false,true]) for (const initial of [0,-1]) {
    const launch='kernel['+blocks+', '+width+'](a, b, out, '+n+')';
    const init=initial===0?'np.zeros('+n+', dtype=np.float32)':'np.full('+n+', -1, dtype=np.float32)';
    const adjust='b_host[-1] = -a_host[-1]';
    let source=starter.replace(oldLaunch,launch.split('(')[0]).replace('np.zeros('+n+', dtype=np.float32)',init);
    const a=fixture.buffers.a.values, b=fixture.buffers.b.values.slice();
    if (cancel) {
      source=source.replace('    b = cuda.to_device(b_host)','    '+adjust+'\n    b = cuda.to_device(b_host)');
      b[n-1]=-a[n-1];
    }
    programs.set(source,{source,n,blocks,width,cancel,initial,a,b,launch,init:'out_host = '+init,adjust});
  }
  return programs;
}

export function mapPrediction(p) {
  if (!p) return {question:'What do you expect your edited vector program to print?',
    evidence:'These edits are outside the ownership model. Follow the Python code and compare your prediction with its printed output.'};
  const last=p.n-1;
  return {question:'With '+p.n+' elements, '+p.blocks+' '+(p.blocks===1?'block':'blocks')+' × '+p.width+' threads, who can write out['+last+']? How many threads skip the store?',
    evidence:'The last inputs are '+p.a[last]+' and '+p.b[last]+'. Output starts at '+p.initial+'. Predict the last value, then Run. The Console prints the array. Ownership and coverage come from the source.'};
}
