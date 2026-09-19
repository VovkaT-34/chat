(function(){
'use strict';

const RENDER = 'https://glaz-boga-osint.onrender.com';
const controlsEl = () => document.getElementById('mailaccessRamControls');
const ramEl = () => document.getElementById('mailaccessRamIndicator');
const resetEl = () => document.getElementById('mailaccessRamReset');
const kindEl = () => document.getElementById('deepKind');

function isMailAccessSelected(){
  const kind = kindEl();
  return !!kind && kind.value === 'email_mailaccess';
}

function setVisible(visible){
  const el = controlsEl();
  if(el) el.hidden = !visible;
}

async function updateRam(){
  if(!isMailAccessSelected()){
    setVisible(false);
    return;
  }
  setVisible(true);
  const el = ramEl();
  if(!el) return;
  try{
    const r = await fetch(RENDER + '/mailaccess/memory?ts=' + Date.now(), {cache:'no-store'});
    if(!r.ok) return;
    const d = await r.json();
    const n = Number(d.ram_mb);
    if(Number.isFinite(n)){
      el.textContent = 'ОЗУ: ' + n.toFixed(1) + ' MB';
      el.classList.toggle('osint-ram-high', n >= 500);
    }
  }catch(e){}
}

async function resetRam(){
  const b = resetEl();
  if(!b || b.disabled || !isMailAccessSelected()) return;
  b.disabled = true;
  try{
    const r = await fetch(RENDER + '/mailaccess/memory/reset', {
      method:'POST',
      cache:'no-store'
    });
    const d = await r.json().catch(()=>({}));
    if(!r.ok){
      alert(d.detail || 'Очистка ОЗУ MailAccess сейчас недоступна.');
      return;
    }
    await updateRam();
  }catch(e){
    alert('Не удалось выполнить очистку ОЗУ MailAccess.');
  }finally{
    b.disabled = false;
  }
}

function start(){
  const kind = kindEl();
  const b = resetEl();
  if(b && !b.dataset.mailaccessRamBound){
    b.dataset.mailaccessRamBound = '1';
    b.addEventListener('click', resetRam);
  }
  if(kind && !kind.dataset.mailaccessRamBound){
    kind.dataset.mailaccessRamBound = '1';
    kind.addEventListener('change', updateRam);
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
    setTimeout(tick, 2500);
  };
  tick();
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', start, {once:true});
}else{
  start();
}
})();