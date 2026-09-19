(function(){
'use strict';
const RENDER='https://glaz-boga-osint.onrender.com',RENDER_MOSINT='https://glaz-boga-osint-docker-test.onrender.com';
const ramEl=()=>document.getElementById('osintRamIndicator'),resetEl=()=>document.getElementById('osintRamReset');
const mailRamBox=()=>document.getElementById('mailaccessRamControls'),mailRamEl=()=>document.getElementById('mailaccessRamIndicator'),mailResetEl=()=>document.getElementById('mailaccessRamReset');
const eyeEl=()=>document.getElementById('glazEye'),deepSearchEl=()=>document.getElementById('deepSearchButton'),deepKindEl=()=>document.getElementById('deepKind');
function mailaccessSelected(){return !!deepKindEl()&&deepKindEl().value==='email_mailaccess';}
function setMailaccessVisibility(){const box=mailRamBox();if(box)box.hidden=!mailaccessSelected();}
function setScanning(scanning){
  const b=resetEl(),mb=mailResetEl(),eye=eyeEl(),search=deepSearchEl();
  if(b){b.disabled=!!scanning;b.textContent=scanning?'Очистить · занято':'Очистить';b.title=scanning?'Очистка ОЗУ недоступна во время сканирования':'';}
  if(mb){mb.disabled=!!scanning;mb.textContent=scanning?'Очистить · занято':'Очистить';mb.title=scanning?'Очистка ОЗУ недоступна во время сканирования':'';}
  if(eye)eye.classList.toggle('glaz-eye-scanning',!!scanning);
  if(search){search.disabled=!!scanning;search.textContent=scanning?'Поиск · занято':'Поиск';search.title=scanning?'Глубокий поиск уже выполняется другим пользователем':'';}
}
async function updateRam(){
  const el=ramEl();if(!el)return;
  try{const r=await fetch(RENDER+'/memory?ts='+Date.now(),{cache:'no-store'});if(!r.ok)return;const d=await r.json(),n=Number(d.ram_mb);if(Number.isFinite(n)){el.textContent='ОЗУ: '+n.toFixed(1)+' MB';el.classList.toggle('osint-ram-high',n>=500);}}catch(e){}
}
async function getOsintAuthHeaders(){
  const headers=new Headers();
  try{
    if(window.supabaseClient){
      const result=await window.supabaseClient.auth.getSession();
      const token=result&&result.data&&result.data.session?result.data.session.access_token||'':'';
      if(token)headers.set('Authorization','Bearer '+token);
    }
  }catch(e){}
  if(!headers.has('Authorization')){
    try{
      const raw=localStorage.getItem('sb-sxkukrqjtgkxmzuzondm-auth-token');
      const stored=raw?JSON.parse(raw):null;
      if(stored&&stored.access_token)headers.set('Authorization','Bearer '+stored.access_token);
    }catch(e){}
  }
  return headers;
}
async function updateMailaccessRam(){
  if(!mailaccessSelected()){setMailaccessVisibility();return;}
  setMailaccessVisibility();
  const el=mailRamEl();if(!el)return;
  try{
    const headers=await getOsintAuthHeaders();
    const r=await fetch(RENDER+'/mailaccess/memory?ts='+Date.now(),{cache:'no-store',headers});
    if(!r.ok)return;
    const d=await r.json(),n=Number(d.ram_mb);
    if(Number.isFinite(n)){el.textContent='ОЗУ: '+n.toFixed(1)+' MB';el.classList.toggle('osint-ram-high',n>=500);}
  }catch(e){}
}
async function updateScanState(){
  try{
    const urls=[RENDER+'/scan/state?ts='+Date.now(),RENDER_MOSINT+'/scan/state?ts='+Date.now()];
    const states=await Promise.allSettled(urls.map(url=>fetch(url,{cache:'no-store'}).then(r=>r.ok?r.json():null)));
    const scanning=states.some(x=>x.status==='fulfilled'&&x.value&&x.value.scanning===true);
    setScanning(scanning);
  }catch(e){}
}
async function resetRam(){
  const b=resetEl();if(!b||b.disabled)return;b.disabled=true;
  try{const r=await fetch(RENDER+'/memory/reset',{method:'POST'}),d=await r.json().catch(()=>({}));if(!r.ok){alert(d.detail||'Очистка ОЗУ сейчас недоступна.');return;}await updateRam();}
  catch(e){alert('Не удалось выполнить очистку ОЗУ.')}
  finally{await updateScanState();if(!b.title.includes('недоступна'))b.disabled=false;}
}
async function resetMailaccessRam(){
  const b=mailResetEl();if(!b||b.disabled)return;b.disabled=true;
  try{
    const headers=await getOsintAuthHeaders();
    const r=await fetch(RENDER+'/mailaccess/memory/reset',{method:'POST',headers});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){alert(d.detail||'Очистка ОЗУ MailAccess сейчас недоступна.');return;}
    if(mailRamEl())mailRamEl().textContent='ОЗУ: перезапуск…';
    setTimeout(updateMailaccessRam,5000);
  }catch(e){alert('Не удалось выполнить очистку ОЗУ MailAccess.')}
  finally{await updateScanState();if(!b.title.includes('недоступна'))b.disabled=false;}
}
function start(){
  const b=resetEl(),mb=mailResetEl(),kind=deepKindEl();
  if(b&&!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',resetRam);}
  if(mb&&!mb.dataset.bound){mb.dataset.bound='1';mb.addEventListener('click',resetMailaccessRam);}
  if(kind&&!kind.dataset.ramBound){kind.dataset.ramBound='1';kind.addEventListener('change',()=>{setMailaccessVisibility();updateMailaccessRam();});}
  setMailaccessVisibility();updateRam();updateMailaccessRam();updateScanState();
  let busy=false;
  const tick=async()=>{if(busy){setTimeout(tick,500);return;}busy=true;await Promise.allSettled([updateRam(),updateScanState()]);if(mailaccessSelected())await updateMailaccessRam();busy=false;setTimeout(tick,2500);};tick();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();