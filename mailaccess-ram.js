(function(){
'use strict';

const RENDER_MAIN = 'https://glaz-boga-osint.onrender.com';
const SUPABASE_URL = 'https://sxkukrqjtgkxmzuzondm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N';
let supabaseClient = null;

const controlsEl = () => document.getElementById('mailaccessRamControls');
const ramEl = () => document.getElementById('mailaccessRamIndicator');
const resetEl = () => document.getElementById('mailaccessRamReset');
let scanning = false;
let resetInProgress = false;
let serviceResetting = false;

function setVisible(visible){
  const el = controlsEl();
  if(el) el.hidden = !visible;
}

function setScanning(value, resetting){
  scanning = !!value;
  serviceResetting = !!resetting;
  const b = resetEl();
  const el = ramEl();
  if(serviceResetting && el) el.textContent = 'ОЗУ: перезапуск…';
  if(!b) return;
  const busy = scanning || serviceResetting || resetInProgress;
  b.disabled = busy;
  b.textContent = busy ? 'Очистить · занято' : 'Очистить';
  b.title = serviceResetting ? 'MailAccess автоматически очищается после проверки' : scanning ? 'Очистка ОЗУ недоступна во время поиска' : resetInProgress ? 'Очистка ОЗУ выполняется' : '';
}

async function updateScanState(){
  try{
    const r = await fetch(RENDER_MAIN + '/scan/state?ts=' + Date.now(), {cache:'no-store', headers:await authHeaders()});
    if(!r.ok) return;
    const d = await r.json();
    setScanning(d.scanning === true, d.mailaccess_resetting === true);
  }catch(e){}
}

async function authHeaders(){
  try{
    const existing = window.supabaseClient || window.supabase;
    if(existing && typeof existing.auth?.getSession === 'function'){
      const {data} = await existing.auth.getSession();
      const token = data?.session?.access_token;
      return token ? {Authorization:'Bearer '+token} : {};
    }
    if(!supabaseClient && window.supabase?.createClient){
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
      });
    }
    if(supabaseClient){
      const {data} = await supabaseClient.auth.getSession();
      const token = data?.session?.access_token;
      return token ? {Authorization:'Bearer '+token} : {};
    }
  }catch(e){}
  return {};
}

async function updateRam(){
  setVisible(true);
  const el = ramEl();
  if(!el) return;
  if(serviceResetting || resetInProgress){
    el.textContent = 'ОЗУ: перезапуск…';
    return;
  }
  try{
    const r = await fetch(RENDER_MAIN + '/mailaccess/memory?ts=' + Date.now(), {cache:'no-store', headers:await authHeaders()});
    if(!r.ok){
      if(r.status === 502) el.textContent = 'ОЗУ: ожидание метрик';
      return;
    }
    const d = await r.json();
    const n = Number(d.ram_mb);
    if(Number.isFinite(n)){
      el.textContent = 'ОЗУ: ' + n.toFixed(1) + ' MB';
      el.title = '';
      el.classList.toggle('osint-ram-high', n >= 500);
    }
  }catch(e){}
}

async function resetRam(){
  const b = resetEl();
  if(!b || b.disabled) return;
  resetInProgress = true;
  const el = ramEl();
  if(el) el.textContent = 'ОЗУ: перезапуск…';
  setScanning(scanning, false);
  try{
    const r = await fetch(RENDER_MAIN + '/mailaccess/memory/reset', {
      method:'POST', cache:'no-store', headers:await authHeaders()
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      alert(d.detail || 'Очистка ОЗУ MailAccess сейчас недоступна.');
      return;
    }
    setTimeout(updateRam, 2500);
  }catch(e){
    alert('Не удалось выполнить очистку ОЗУ MailAccess.');
  }finally{
    resetInProgress = false;
    await updateScanState();
  }
}

function start(){
  setVisible(true);
  const b = resetEl();
  if(b && !b.dataset.mailaccessRamBound){
    b.dataset.mailaccessRamBound = '1';
    b.addEventListener('click', resetRam);
  }

  updateRam();
  updateScanState();
  let busy = false;
  const tick = async () => {
    if(busy){
      setTimeout(tick, 500);
      return;
    }
    busy = true;
    await Promise.allSettled([updateRam(), updateScanState()]);
    busy = false;
    setTimeout(tick, 5000);
  };
  tick();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start, {once:true});
}else{
  start();
}
})();