(function(){
'use strict';
const RENDER='https://glaz-boga-osint.onrender.com',RENDER_MOSINT='https://glaz-boga-osint-docker-test.onrender.com';
const ramEl=()=>document.getElementById('osintRamIndicator'),resetEl=()=>document.getElementById('osintRamReset'),eyeEl=()=>document.getElementById('glazEye'),deepSearchEl=()=>document.getElementById('deepSearchButton');
async function authHeaders(){
try{
const client=window.supabaseClient;
if(client&&typeof client.auth?.getSession==='function'){
const {data}=await client.auth.getSession();
const token=data?.session?.access_token;
if(token)return {Authorization:'Bearer '+token};
}
}catch(e){}
try{
const raw=localStorage.getItem('sb-sxkukrqjtgkxmzuzondm-auth-token');
const stored=raw?JSON.parse(raw):null;
if(stored?.access_token)return {Authorization:'Bearer '+stored.access_token};
}catch(e){}
return {};
}
function setScanning(scanning){const b=resetEl(),eye=eyeEl(),search=deepSearchEl();if(b){b.disabled=!!scanning;b.textContent=scanning?'Очистить · занято':'Очистить';b.title=scanning?'Очистка ОЗУ недоступна во время сканирования':'';}if(eye)eye.classList.toggle('glaz-eye-scanning',!!scanning);if(search){search.disabled=!!scanning;search.textContent=scanning?'Поиск · занято':'Поиск';search.title=scanning?'Глубокий поиск уже выполняется другим пользователем':'';}}
async function updateRam(){const el=ramEl();if(!el)return;try{const r=await fetch(RENDER+'/memory?ts='+Date.now(),{cache:'no-store',headers:await authHeaders()});if(!r.ok)return;const d=await r.json(),n=Number(d.ram_mb);if(Number.isFinite(n)){el.textContent='ОЗУ: '+n.toFixed(1)+' MB';el.classList.toggle('osint-ram-high',n>=500);}}catch(e){}}
async function updateScanState(){try{const urls=[RENDER+'/scan/state?ts='+Date.now(),RENDER_MOSINT+'/scan/state?ts='+Date.now()];const headers=await authHeaders();const states=await Promise.allSettled(urls.map(url=>fetch(url,{cache:'no-store',headers}).then(r=>r.ok?r.json():null)));const scanning=states.some(x=>x.status==='fulfilled'&&x.value&&x.value.scanning===true);setScanning(scanning);}catch(e){}}
async function resetRam(){const b=resetEl();if(!b||b.disabled)return;b.disabled=true;try{const r=await fetch(RENDER+'/memory/reset',{method:'POST',headers:await authHeaders()}),d=await r.json().catch(()=>({}));if(!r.ok){alert(d.detail||'Очистка ОЗУ сейчас недоступна.');return;}await updateRam();}catch(e){alert('Не удалось выполнить очистку ОЗУ.');}finally{await updateScanState();if(!b.title.includes('недоступна'))b.disabled=false;}}
function start(){const b=resetEl();if(b&&!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',resetRam);}updateRam();updateScanState();let busy=false;const tick=async()=>{if(busy){setTimeout(tick,500);return;}busy=true;await Promise.allSettled([updateRam(),updateScanState()]);busy=false;setTimeout(tick,5000);};tick();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
