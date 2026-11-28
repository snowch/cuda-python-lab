// Adapt the shared two-phase restart protocol to this hash-routed course.
// Every open tab must save successfully before the worker switches releases.
const readingURL=new URL(location.href);
readingURL.searchParams.delete('download');
readingURL.searchParams.delete('gpu-release');
const legacyKey='cuda-python-lab:restart:'+readingURL.pathname+readingURL.search;
const key = legacyKey + ':reading-v2';
let hook, composing=false, lock, timer;
export function registerReadingState(value) { hook=value; }
export function legacyReadingWork() {
  try { return JSON.parse(sessionStorage.getItem(legacyKey))?.work; } catch { return null; }
}
export function clearLegacyReadingWork() { sessionStorage.removeItem(legacyKey); }
function readPosition() {
  try { const value=JSON.parse(sessionStorage.getItem(key) ?? sessionStorage.getItem(legacyKey));return value?.schema===1&&value.hash===location.hash?value:null; } catch {return null;}
}
let position = readPosition();
export function savedReadingState() { return position?.hash === location.hash ? position : null; }
function snapshot() {
  if(!hook||composing||document.readyState!=='complete')throw new Error('Wait for each lesson to load and finish typing before restarting.');
  const guard={reason:''};dispatchEvent(new CustomEvent('cuda-python-lab:before-restart',{detail:guard}));
  if(guard.reason)throw new Error(guard.reason);
  const value={schema:1,hash:location.hash,scroll:[scrollX,scrollY],
    details:[...document.querySelectorAll('main details')].map(el=>[el.id,el.open]),
    controls:[...document.querySelectorAll('main input:not(#complete),main select:not(#work-version),main textarea:not(#prediction):not(#work-copy-text)')].map(el=>[el.id,el.value])};
  const encoded=JSON.stringify(value);sessionStorage.setItem(key,encoded);
  if(sessionStorage.getItem(key)!==encoded)throw new Error('This window could not save its work. Allow browser storage and retry.');
}
export async function saveReadingState() { await hook?.flush(); snapshot(); }
function unlock(){clearTimeout(timer);lock=null;document.querySelector('main').inert=false;document.querySelector('.site-header').inert=false;document.querySelector('.course-navigation').inert=false;}
addEventListener('compositionstart',()=>{composing=true;});addEventListener('compositionend',()=>{composing=false;});
navigator.serviceWorker?.addEventListener('message',async ({data,ports})=>{
  if(data?.type==='PREPARE_RESTART') {
    if(lock){ports[0].postMessage({ready:false,error:'This window is already restarting.'});return;}
    try {
      lock=data.token;
      for(const el of document.querySelectorAll('main,.site-header,.course-navigation'))el.inert=true;
      timer=setTimeout(unlock,12000);
      await saveReadingState();
      if(lock!==data.token)throw Error('Restart cancelled.');
      ports[0].postMessage({ready:true});
    }catch(error){if(lock===data.token)unlock();ports[0].postMessage({ready:false,error:error.message});}
  }
  if(data?.type==='ABORT_RESTART'&&data.token===lock){unlock();sessionStorage.removeItem(key);}
  if(data?.type==='COMMIT_RESTART'&&data.token===lock)location.reload();
});
export function restoreReadingState() {
  const value=savedReadingState();if(!value)return;
  for(const [id,open] of value.details){const el=document.getElementById(id);if(el)el.open=open;}
  for(const [id,text] of value.controls){if(id==="prediction"||id==="case")continue;const el=document.getElementById(id);if(el&&el.value!==text){el.value=text;el.dispatchEvent(new Event('input'));}}
  requestAnimationFrame(()=>scrollTo(...value.scroll));
  position = null;
  try { sessionStorage.removeItem(key); } catch { /* Reading the saved position already succeeded. */ }
}

addEventListener('pagehide',event=>{if(!lock&&!event.persisted)try{snapshot();}catch{/* Durable drafts remain when a per-tab reading snapshot is unavailable. */}});
