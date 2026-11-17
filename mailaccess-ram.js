(function(){
'use strict';

const RENDER_MAIN = 'https://glaz-boga-osint.onrender.com';
const SUPABASE_URL = 'https://sxkukrqjtgkxmzuzondm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N';
let supabaseClient = null;

const controlsEl = () => document.getElementById('mailaccessRamControls');
const ramEl = () => document.getElementById('mailaccessRamIndicator');
const resetEl = () => document.getElementById('mailaccessRamReset');

function setVisible(visible){
  const el = controlsEl();
  if(el) el.hidden = !visible;
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
  try{
    const r = await fetch(RENDER_MAIN + '/mailaccess/memory?ts=' + Date.now(), {cache:'no-store'});
    if(!r.ok){
      el.textContent = 'ОЗУ: недоступно';
      el.title = 'MailAccess: HTTP ' + r.status;
      return;
    }
    const d = await r.json();
    const n = Number(d.ram_mb);
    if(Number.isFinite(n)){
      el.textContent = 'ОЗУ: ' + n.toFixed(1) + ' MB';
      el.title = 'Память отдельного сервиса glaz-boga-mailaccess';
      el.classList.toggle('osint-ram-high', n >= 500);
    }else{
      el.textContent = 'ОЗУ: нет данных';
      el.title = 'Render API не вернул значение RAM MailAccess';
    }
  }catch(e){
    el.textContent = 'ОЗУ: нет связи';
    el.title = 'Не удалось получить RAM MailAccess';
  }
}

async function resetRam(){
  const b = resetEl();
  if(!b || b.disabled) return;
  b.disabled = true;
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
    b.disabled = false;
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
  let busy = false;
  const tick = async () => {
    if(busy){
      setTimeout(tick, 500);
      return;
    }
    busy = true;
    await updateRam();
    busy = false;
    setTimeout(tick, 30000);
  };
  tick();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start, {once:true});
}else{
  start();
}
})();