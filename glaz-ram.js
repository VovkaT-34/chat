(function(){
'use strict';
const RENDER='https://glaz-boga-osint.onrender.com',RENDER_MOSINT='https://glaz-boga-osint-docker-test.onrender.com';
const ramEl=()=>document.getElementById('osintRamIndicator'),resetEl=()=>document.getElementById('osintRamReset'),eyeEl=()=>document.getElementById('glazEye'),deepSearchEl=()=>document.getElementById('deepSearchButton');
let ramInstanceStartedAt=null,resetInProgress=false,resetFallbackTimer=null;
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
function setScanning(scanning,resetting,unavailable){const b=resetEl(),eye=eyeEl(),search=deepSearchEl(),busy=!!scanning||!!resetting||resetInProgress,serverUnavailable=!!unavailable;if(b){b.disabled=busy||serverUnavailable;b.textContent=busy?'Очистить · занято':'Очистить';b.title=resetting||resetInProgress?'Очистка ОЗУ выполняется':scanning?'Очистка ОЗУ недоступна во время сканирования':serverUnavailable?'Основной сервер недоступен — очистка временно недоступна':'';}if(eye)eye.classList.toggle('glaz-eye-scanning',!!scanning);if(search){search.disabled=busy||serverUnavailable;search.textContent='Поиск';search.title=serverUnavailable?'Нет связи с основным сервером':busy?'Выполняется поиск или очистка ОЗУ':scanning?'Глубокий поиск уже выполняется другим пользователем':'';}}
async function updateRam(){const el=ramEl();if(!el)return;try{const r=await fetch(RENDER+'/memory?ts='+Date.now(),{cache:'no-store',headers:await authHeaders()});if(!r.ok)return;const d=await r.json(),n=Number(d.ram_mb),startedAt=Number(d.instance_started_at);if(Number.isFinite(startedAt)){if(resetInProgress&&(ramInstanceStartedAt===null||startedAt!==ramInstanceStartedAt)){resetInProgress=false;if(resetFallbackTimer){clearTimeout(resetFallbackTimer);resetFallbackTimer=null;}}ramInstanceStartedAt=startedAt;}if(Number.isFinite(n)){el.textContent='ОЗУ: '+n.toFixed(1)+' MB';el.classList.toggle('osint-ram-high',n>=500);}}catch(e){}}
async function updateScanState(){try{const urls=[RENDER+'/scan/state?ts='+Date.now(),RENDER_MOSINT+'/scan/state?ts='+Date.now()];const headers=await authHeaders();const states=await Promise.allSettled(urls.map(url=>fetch(url,{cache:'no-store',headers}).then(r=>r.ok?r.json():null)));const scanning=states.some(x=>x.status==='fulfilled'&&x.value&&x.value.scanning===true);const primaryUnavailable=states[0].status!=='fulfilled'||!states[0].value;const resetting=states.some(x=>x.status==='fulfilled'&&x.value&&x.value.resetting===true);setScanning(scanning,resetting,primaryUnavailable);}catch(e){}}
async function resetRam(){const b=resetEl();if(!b||b.disabled)return;resetInProgress=true;if(resetFallbackTimer)clearTimeout(resetFallbackTimer);resetFallbackTimer=setTimeout(()=>{resetInProgress=false;resetFallbackTimer=null;updateScanState();},120000);try{const r=await fetch(RENDER+'/memory/reset',{method:'POST',headers:await authHeaders()}),d=await r.json().catch(()=>({}));if(!r.ok){resetInProgress=false;if(resetFallbackTimer){clearTimeout(resetFallbackTimer);resetFallbackTimer=null;}alert(d.detail||'Очистка ОЗУ сейчас недоступна.');return;}await updateRam();}catch(e){alert('Соединение прервалось во время перезапуска. Ожидаю восстановления сервера.');}finally{await updateScanState();}}
function start(){const b=resetEl();if(b&&!b.dataset.bound){b.dataset.bound='1';b.addEventListener('click',resetRam);}updateRam();updateScanState();let busy=false;const tick=async()=>{if(busy){setTimeout(tick,500);return;}busy=true;await Promise.allSettled([updateRam(),updateScanState()]);busy=false;setTimeout(tick,5000);};tick();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
