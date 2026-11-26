(function(){
'use strict';
var canvas=document.getElementById('volkCanvas'),ctx=canvas.getContext('2d'),scoreEl=document.getElementById('volkScore'),bestEl=document.getElementById('volkBest'),livesEl=document.getElementById('volkLives'),overlay=document.getElementById('volkOverlay'),overlayTitle=document.getElementById('overlayTitle'),overlayText=document.getElementById('overlayText'),startBtn=document.getElementById('startVolk'),exitBtn=document.getElementById('exitVolk'),soundBtn=document.getElementById('soundToggle');
var kamenskyImage=new Image();kamenskyImage.onload=function(){render()};kamenskyImage.src='kamensky-poses.webp';
var ratEscape=null,lanes=[105,248,392,535],lane=0,ingots=[],score=0,lives=4,best=0,running=false,paused=false,last=0,spawn=0,raf=0,soundOn=true,audio=null,caughtIngots=0,particles=[],splats=[],laying=[0,0,0,0],pendingIngot=null,breakPause=0,batchSize=1,batchLaunched=0,shortWaveGap=false,mode=1,bonusIngotQueued=false,bonusIngotActive=false,bonusIngotWindowUsed=-1;
try{localStorage.removeItem('volk-best');best=Number(localStorage.getItem('volk-best-v2')||0)}catch(e){}bestEl.textContent=best;
function audioReady(){if(!soundOn)return null;try{var A=window.AudioContext||window.webkitAudioContext;if(!A)return null;if(!audio)audio=new A();if(audio.state==='suspended')audio.resume();return audio}catch(e){return null}}
function tone(freq,duration,type,volume,when){var a=audioReady();if(!a)return;var o=a.createOscillator(),g=a.createGain(),t=a.currentTime+(when||0);o.type=type||'sine';o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(volume||.025,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+duration)}
function tick(){tone(780,.045,'square',.1);tone(1080,.035,'sine',.07,.055)}
function catchSound(){tone(620,.09,'triangle',.22);tone(920,.13,'sine',.18,.08);tone(1240,.16,'sine',.13,.17)}
function goldenCatchSound(){tone(740,.12,'sine',.2);tone(988,.14,'sine',.2,.09);tone(1318,.2,'sine',.22,.19);tone(1760,.28,'triangle',.16,.31)}
function queueBonusIngot(){if(lives<1||lives>2||score<70)return;var windowStart=70+Math.floor((score-70)/100)*100;if(score>windowStart+30||bonusIngotWindowUsed>=windowStart)return;bonusIngotWindowUsed=windowStart;bonusIngotQueued=true}
function launchBonusIngot(speed){var ln=Math.floor(Math.random()*4);ingots.push({lane:ln,x:lanes[ln],y:78,vy:speed,rollStep:0,bump:0,checked:false,missed:false,done:false,golden:true,w:35,h:20});bonusIngotQueued=false;bonusIngotActive=true;spawn=0}
function ingotCaught(e){caughtIngots++;score++;scoreEl.textContent=score;if(e.golden){lives=Math.min(4,lives+1);livesEl.textContent='♥ '.repeat(lives).trim()||'—';bonusIngotActive=false;goldenCatchSound();for(var j=0;j<16;j++)particles.push({x:e.x+(Math.random()-.5)*38,y:390+(Math.random()-.5)*28,color:j%2?'#ffe66b':'#ffbf24',size:2+Math.random()*4,life:32})}else{catchSound();for(var k=0;k<8;k++)particles.push({x:e.x+(Math.random()-.5)*25,y:397,color:'#ffe7a0',size:2+Math.random()*3,life:25})}queueBonusIngot()}
function crack(){var a=audioReady();if(!a)return;var n=a.createBufferSource(),b=a.createBuffer(1,Math.floor(a.sampleRate*.18),a.sampleRate),d=b.getChannelData(0);for(var i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);n.buffer=b;var f=a.createBiquadFilter();f.type='highpass';f.frequency.value=650;var g=a.createGain();g.gain.value=.7;g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.18);n.connect(f);f.connect(g);g.connect(a.destination);n.start();tone(150,.12,'sawtooth',.18)}
function intro(){tone(523,.12,'triangle',.14);tone(659,.12,'triangle',.14,.13);tone(784,.2,'triangle',.16,.26)}
function drawBackground(){var g=ctx.createLinearGradient(0,0,0,520);g.addColorStop(0,'#c9e7a0');g.addColorStop(.62,'#8fc36e');g.addColorStop(1,'#477b45');ctx.fillStyle=g;ctx.fillRect(0,0,640,520);
ctx.fillStyle='#e8d6a0';ctx.fillRect(0,0,640,58);ctx.fillStyle='#b77a3f';ctx.fillRect(0,54,640,9);
for(var i=0;i<4;i++)drawWoodChute(lanes[i]);
ctx.fillStyle='#725037';ctx.fillRect(0,435,640,85);ctx.fillStyle='#a87b4a';for(var k=0;k<640;k+=32)ctx.fillRect(k,435,2,85);ctx.fillStyle='#d9b17a';ctx.fillRect(0,435,640,7);
ctx.fillStyle='#4c8b48';ctx.fillRect(0,427,640,9)}
function drawWoodChute(x){ctx.save();ctx.translate(x,0);
/* Четыре разных обрубка: количество сучьев задано отдельно для каждого. */
var treeIndex=lanes.indexOf(x);
var branchSets=[
  {left:[{y:126,len:24,angle:-.16,w:14},{y:318,len:31,angle:.24,w:17}],right:[{y:222,len:29,angle:-.18,w:16}]},
  {left:[{y:112,len:30,angle:-.22,w:17},{y:246,len:23,angle:.16,w:13},{y:365,len:34,angle:-.2,w:18}],right:[{y:102,len:27,angle:.18,w:15},{y:184,len:34,angle:-.24,w:18},{y:286,len:25,angle:.2,w:14},{y:382,len:30,angle:-.15,w:16}]},
  {left:[{y:166,len:29,angle:.2,w:16},{y:342,len:25,angle:-.18,w:14}],right:[{y:126,len:32,angle:-.2,w:17},{y:246,len:26,angle:.18,w:15},{y:365,len:34,angle:-.22,w:18}]},
  {left:[{y:258,len:32,angle:-.2,w:17}],right:[{y:158,len:24,angle:.18,w:14},{y:342,len:30,angle:-.16,w:16}]}
];
var branches=branchSets[treeIndex]||branchSets[0];
var wood=ctx.createLinearGradient(-52,0,52,0);wood.addColorStop(0,'#60351d');wood.addColorStop(.24,'#a96a35');wood.addColorStop(.5,'#d39a59');wood.addColorStop(.78,'#a96a35');wood.addColorStop(1,'#60351d');
ctx.shadowColor='#39251688';ctx.shadowBlur=5;ctx.shadowOffsetY=3;
/* Ствол слегка расширяется у основания, как настоящее дерево. */
ctx.fillStyle=wood;ctx.strokeStyle='#57351f';ctx.lineWidth=3;ctx.lineJoin='round';
ctx.beginPath();ctx.moveTo(-37,72);ctx.quadraticCurveTo(-39,245,-40,438);ctx.quadraticCurveTo(0,447,40,438);ctx.quadraticCurveTo(39,245,37,72);ctx.quadraticCurveTo(0,58,-37,72);ctx.closePath();ctx.fill();ctx.stroke();
/* Все сучья растут вверх: у основания они толще, кверху постепенно сужаются. */
function drawBranch(side,b){
  var rootX=side*31;
  var rise=b.len*.78;
  var tipX=rootX+side*(b.len+Math.abs(Math.sin(b.angle))*b.len*.22);
  var tipY=b.y-rise;
  var midX=rootX+(tipX-rootX)*.58;
  var midY=b.y-rise*.48;
  var thickness=b.w*(.82+Math.max(0,Math.min(1,(b.y-100)/282))*.78);
  var half=thickness/2;
  var tipW=Math.max(2.2,thickness*.13);
  ctx.fillStyle=wood;ctx.strokeStyle='#57351f';ctx.lineWidth=2.5;ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(rootX-side*3,b.y+half*.38);
  ctx.quadraticCurveTo(rootX+side*6,b.y+half*.72,midX,midY+tipW*2.1);
  ctx.quadraticCurveTo(tipX-side*5,tipY+tipW*1.35,tipX,tipY+tipW*.15);
  /* Ломаный торец: несколько неровных сколов вместо ровного спила. */
  ctx.lineTo(tipX+side*2.4,tipY-tipW*.48);
  ctx.lineTo(tipX-side*.5,tipY-tipW*1.35);
  ctx.lineTo(tipX-side*2.2,tipY-tipW*.72);
  ctx.quadraticCurveTo(midX-side*4,midY-tipW*1.9,rootX+side*8,b.y-half*.68);
  ctx.quadraticCurveTo(rootX+side*2,b.y-half*.82,rootX-side*3,b.y-half*.32);
  ctx.closePath();ctx.fill();ctx.stroke();
  /* Светлые неровные грани древесины на месте свежего излома. */
  ctx.strokeStyle='#d39a5d';ctx.lineWidth=1.8;
  ctx.beginPath();
  ctx.moveTo(tipX+side*1.8,tipY-tipW*.42);
  ctx.lineTo(tipX-side*.45,tipY-tipW*1.18);
  ctx.lineTo(tipX-side*1.8,tipY-tipW*.68);
  ctx.stroke();
}
branches.left.forEach(function(b){drawBranch(-1,b)});
branches.right.forEach(function(b){drawBranch(1,b)});
ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;
/* Гладкий внутренний канал для скольжения золотых слитков. */
var hollow=ctx.createLinearGradient(-31,0,31,0);hollow.addColorStop(0,'#58351f');hollow.addColorStop(.16,'#80502d');hollow.addColorStop(.5,'#a16b3d');hollow.addColorStop(.84,'#80502d');hollow.addColorStop(1,'#50301d');
ctx.fillStyle=hollow;ctx.beginPath();ctx.moveTo(-27,76);
ctx.quadraticCurveTo(-27,210,-26,432);ctx.quadraticCurveTo(0,440,26,432);
ctx.quadraticCurveTo(27,210,27,76);ctx.quadraticCurveTo(0,68,-27,76);ctx.closePath();ctx.fill();
ctx.strokeStyle='#e0ad70';ctx.lineWidth=3;ctx.beginPath();
ctx.moveTo(-35,78);ctx.quadraticCurveTo(-35,245,-33,425);
ctx.moveTo(35,78);ctx.quadraticCurveTo(35,245,33,425);ctx.stroke();
/* Внутренние волокна и шесть неглубоких зарубок сохранены. */
ctx.strokeStyle='#4c2d1b';ctx.lineWidth=1.5;
[[-17,96,-13,414],[-8,88,-6,421],[17,94,13,414]].forEach(function(p){ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.quadraticCurveTo(p[0]-2,250,p[2],p[3]);ctx.stroke()});
for(var n=0;n<6;n++){var ny=78+(n+1)*(308/6);ctx.strokeStyle='#4b2b19';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-21,ny);ctx.quadraticCurveTo(-9,ny+3,0,ny+1);ctx.quadraticCurveTo(10,ny-1,21,ny+2);ctx.stroke();ctx.strokeStyle='#d7a16a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-20,ny-2);ctx.quadraticCurveTo(-7,ny,0,ny-1);ctx.quadraticCurveTo(10,ny-3,20,ny);ctx.stroke()}
ctx.restore()}
function rollClick(step){tone(430+step*28,.035,'square',.055);tone(650+step*22,.028,'triangle',.035,.025)}
var minerImage=new Image();minerImage.onload=function(){render()};minerImage.src='kamensky-miner-8-opt.webp';
function drawHen(x,remaining){var active=remaining>0,duration=mode===2?.35:.48,progress=active?Math.max(0,Math.min(1,1-remaining/duration)):0,frame=active?4+Math.min(3,Math.floor(progress*4)):Math.floor(performance.now()/900)%4;ctx.save();if(minerImage.complete&&minerImage.naturalWidth)ctx.drawImage(minerImage,(frame%4)*40,Math.floor(frame/4)*53,40,53,x-46,0,92,122);ctx.restore()}
function drawIngot(e){var special=!!e.golden,w=special?70:(e.w||26),h=special?40:(e.h||16);ctx.save();ctx.translate(e.x+Math.sin(e.rollStep*1.35)*2,e.y-e.bump*18);ctx.rotate((e.rollStep%2?1:-1)*.16+Math.sin(e.y/22)*.05);
ctx.shadowColor=special?'#fff3a0':'#8c620c';ctx.shadowBlur=special?34:6;ctx.shadowOffsetY=special?7:3;
var g=ctx.createLinearGradient(-w*.65,-h*.75,w*.65,h*.75);if(special){g.addColorStop(0,'#fffef0');g.addColorStop(.12,'#fff5a0');g.addColorStop(.25,'#ffcf18');g.addColorStop(.38,'#fff9dc');g.addColorStop(.5,'#f49b00');g.addColorStop(.63,'#ffec4f');g.addColorStop(.76,'#bd6800');g.addColorStop(.88,'#fff5a5');g.addColorStop(1,'#ffb900')}else{g.addColorStop(0,'#fff9d0');g.addColorStop(.16,'#ffe879');g.addColorStop(.35,'#d99a18');g.addColorStop(.55,'#a96808');g.addColorStop(.72,'#ffcf43');g.addColorStop(.9,'#b9790b');g.addColorStop(1,'#fff2a1')}
ctx.fillStyle=g;ctx.strokeStyle=special?'#7c4300':'#6d4307';ctx.lineWidth=special?2.4:1.6;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(-w*.48,-h*.35);ctx.lineTo(-w*.29,-h*.72);ctx.lineTo(w*.38,-h*.6);ctx.lineTo(w*.57,-h*.25);ctx.lineTo(w*.43,h*.52);ctx.lineTo(w*.18,h*.72);ctx.lineTo(-w*.48,h*.46);ctx.lineTo(-w*.62,h*.12);ctx.closePath();ctx.fill();ctx.stroke();
ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=special?'#fffbe0':'#fff5b5';ctx.beginPath();ctx.moveTo(-w*.48,-h*.35);ctx.lineTo(-w*.29,-h*.72);ctx.lineTo(w*.38,-h*.6);ctx.lineTo(w*.08,-h*.2);ctx.closePath();ctx.fill();
ctx.fillStyle=special?'#ffbd18':'#c17b0a';ctx.beginPath();ctx.moveTo(-w*.62,h*.12);ctx.lineTo(-w*.48,h*.46);ctx.lineTo(w*.18,h*.72);ctx.lineTo(w*.43,h*.52);ctx.lineTo(w*.08,-h*.2);ctx.closePath();ctx.fill();
ctx.fillStyle=special?'#ffea5b':'#d89413';ctx.beginPath();ctx.moveTo(-w*.48,h*.46);ctx.lineTo(w*.08,-h*.2);ctx.lineTo(w*.43,h*.52);ctx.lineTo(w*.18,h*.72);ctx.closePath();ctx.fill();
ctx.strokeStyle=special?'#fffde0':'#ffed8b';ctx.lineWidth=special?2.4:1.3;ctx.beginPath();ctx.moveTo(-w*.48,-h*.35);ctx.lineTo(w*.08,-h*.2);ctx.lineTo(w*.38,-h*.6);ctx.moveTo(w*.08,-h*.2);ctx.lineTo(w*.43,h*.52);ctx.stroke();
ctx.fillStyle=special?'#fff':'#fff8c6';ctx.beginPath();ctx.ellipse(-w*.25,-h*.35,Math.max(1,w*.1),Math.max(1,h*.14),-.4,0,Math.PI*2);ctx.fill();
if(!special){var t=performance.now()/180,shine=.65+Math.sin(t+e.rollStep)*.35;ctx.globalAlpha=shine;ctx.shadowColor='#fffbd0';ctx.shadowBlur=9;for(var q=0;q<3;q++){var sx=Math.sin(t*1.7+q*2.2)*w*.34,sy=Math.cos(t*1.3+q*1.9)*h*.28;ctx.strokeStyle=q===1?'#ffffff':'#fff7a6';ctx.lineWidth=q===1?2:1.6;ctx.beginPath();ctx.moveTo(sx-3,sy-3);ctx.lineTo(sx+3,sy+3);ctx.moveTo(sx+3,sy-3);ctx.lineTo(sx-3,sy+3);ctx.stroke()}ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,240,.62)';ctx.beginPath();ctx.ellipse(-w*.13,-h*.1,w*.3,h*.09,-.55,0,Math.PI*2);ctx.fill()}if(special){var pulse=.7+Math.sin(performance.now()/90)*.3;ctx.globalAlpha=pulse;for(var z=0;z<8;z++){var a=z*Math.PI/4+performance.now()/800,px=Math.cos(a)*w*.78,py=Math.sin(a)*h*.92;ctx.strokeStyle=z%2?'#ffffff':'#fff3a1';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(px-5,py-5);ctx.lineTo(px+5,py+5);ctx.moveTo(px+5,py-5);ctx.lineTo(px-5,py+5);ctx.stroke()}ctx.globalAlpha=1;ctx.fillStyle='rgba(255,255,255,.5)';ctx.beginPath();ctx.ellipse(-w*.1,-h*.08,w*.32,h*.08,-.55,0,Math.PI*2);ctx.fill()}else if(e.golden){for(var z=0;z<4;z++){var a=z*Math.PI/2+e.rollStep*.18,px=Math.cos(a)*w*.78,py=Math.sin(a)*h*.95;ctx.strokeStyle='#fff6a3';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px-3,py-3);ctx.lineTo(px+3,py+3);ctx.stroke()}}ctx.restore()}function drawSplat(s){ctx.save();ctx.globalAlpha=1;if(s.ingotVisible){ctx.save();ctx.beginPath();ctx.rect(0,0,640,435);ctx.clip();drawIngot(s.ingot);ctx.restore()}ctx.translate(s.x,435);ctx.fillStyle='#725037';ctx.beginPath();ctx.moveTo(-22,2);ctx.quadraticCurveTo(-15,-7,-5,-3);ctx.quadraticCurveTo(7,-8,18,-2);ctx.lineTo(23,3);ctx.quadraticCurveTo(9,8,0,5);ctx.quadraticCurveTo(-12,9,-22,2);ctx.closePath();ctx.fill();ctx.strokeStyle='#d9b17a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-19,1);ctx.quadraticCurveTo(-7,-3,0,0);ctx.quadraticCurveTo(10,-4,19,1);ctx.stroke();ctx.restore()}function drawRat(r){var p=r.t*20;ctx.save();ctx.translate(r.x,429);ctx.fillStyle='#5d4938';ctx.beginPath();ctx.ellipse(-6,-24,44,31,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#cdb9a0';ctx.beginPath();ctx.ellipse(6,-10,22,11,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6b5440';ctx.beginPath();ctx.ellipse(28,-39,23,22,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c7857c';ctx.beginPath();ctx.ellipse(19,-57,12,14,0,0,Math.PI*2);ctx.ellipse(38,-56,10,12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f0b5a5';ctx.beginPath();ctx.arc(19,-57,7,0,Math.PI*2);ctx.arc(38,-56,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17110d';ctx.beginPath();ctx.arc(35,-44,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c97870';ctx.beginPath();ctx.arc(52,-33,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d38b7d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-38,-17);ctx.bezierCurveTo(-65,-29,-82,-11,-100,-25+Math.sin(p)*5);ctx.bezierCurveTo(-115,-39,-109,-49,-98,-45);ctx.stroke();ctx.fillStyle='#e5aa24';ctx.beginPath();ctx.moveTo(53,-38);ctx.lineTo(68,-43);ctx.lineTo(78,-36);ctx.lineTo(76,-27);ctx.lineTo(60,-28);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffe98b';ctx.lineWidth=2;ctx.stroke();for(var i=0;i<4;i++){var legx=-25+i*17,sw=Math.sin(p+i*Math.PI)*9;ctx.strokeStyle='#66503b';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(legx,-5);ctx.lineTo(legx+sw,9);ctx.lineTo(legx+sw+8,11);ctx.stroke()}ctx.restore()}function drawBasket(x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle='#a85c27';ctx.beginPath();ctx.moveTo(-31,-4);ctx.lineTo(31,-4);ctx.lineTo(24,19);ctx.quadraticCurveTo(0,27,-24,19);ctx.closePath();ctx.fill();ctx.strokeStyle='#f0b45d';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#6c3d22';ctx.lineWidth=2;for(var i=-18;i<=18;i+=9){ctx.beginPath();ctx.moveTo(i,-2);ctx.lineTo(i*.72,20);ctx.stroke()}ctx.restore()}
function drawWolf(){
var x=lanes[lane];
if(kamenskyImage.complete&&kamenskyImage.naturalWidth){
ctx.save();
ctx.fillStyle='#243b2b55';ctx.beginPath();ctx.ellipse(x,438,48,8,0,0,Math.PI*2);ctx.fill();
ctx.drawImage(kamenskyImage,lane*72,0,72,72,x-59,320,118,118);
ctx.restore();
}
if(mode!==2){ctx.save();ctx.translate(x,400);drawBasket(0,8);ctx.restore()}
}
function render(){drawBackground();for(var i=0;i<4;i++)drawHen(lanes[i],laying[i]);drawWolf();ingots.forEach(drawIngot);if(mode===2)drawBasket(lanes[lane],408);splats.forEach(drawSplat);if(mode===1&&ratEscape)drawRat(ratEscape);particles.forEach(function(p){ctx.globalAlpha=Math.max(0,p.life/25);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1})}
function ingotsPerStage(){if(caughtIngots<=3)return 1;if(caughtIngots<=11)return 2;if(caughtIngots<=22)return 3;if(caughtIngots<=44)return 4;if(caughtIngots<=100)return 5;return Math.floor((caughtIngots-1)/50)+4}
function updateClassic(dt){var speed=Math.min(300,124+caughtIngots*.8);spawn+=dt;if(bonusIngotQueued&&!pendingIngot&&ingots.length===0)launchBonusIngot(speed);if(!bonusIngotQueued&&!bonusIngotActive&&!pendingIngot&&spawn>Math.max(1.15,1.55-caughtIngots*.0015)){spawn=0;var ln=Math.floor(Math.random()*4);pendingIngot={lane:ln,remaining:.48};laying[ln]=.48;}if(pendingIngot){pendingIngot.remaining-=dt;laying[pendingIngot.lane]=Math.max(0,pendingIngot.remaining);if(pendingIngot.remaining<=0){var ingotLane=pendingIngot.lane;ingots.push({lane:ingotLane,x:lanes[ingotLane],y:78,vy:speed,rollStep:0,bump:0,checked:false,missed:false,done:false,w:[22,28,35][Math.floor(Math.random()*3)],h:[12,16,20][Math.floor(Math.random()*3)]});pendingIngot=null;}}for(var h=0;h<4;h++)if(!pendingIngot||pendingIngot.lane!==h)laying[h]=Math.max(0,laying[h]-dt);ingots.forEach(function(e){e.y+=e.vy*dt;e.bump=Math.max(0,e.bump-dt);while(e.rollStep<6&&e.y>=78+(e.rollStep+1)*(308/6)){e.rollStep++;e.bump=.12;rollClick(e.rollStep)}if(!e.checked&&e.y>386){e.checked=true;if(e.lane===lane){e.done=true;ingotCaught(e)}else{e.missed=true;lives--;livesEl.textContent='♥ '.repeat(lives).trim()||'—';crack();queueBonusIngot()}}if(e.missed&&e.y>=419){e.done=true;if(e.golden)bonusIngotActive=false;splats.push({x:e.x,y:437,life:55,ingot:{x:e.x,y:428,rollStep:e.rollStep,bump:0,w:e.w,h:e.h,golden:!!e.golden}})}});ingots=ingots.filter(function(e){return !e.done});splats.forEach(function(s){s.life--});splats=splats.filter(function(s){return s.life>0});particles.forEach(function(p){p.y-=.5;p.life--});particles=particles.filter(function(p){return p.life>0});if(lives<=0&&!ingots.some(function(e){return e.missed&&!e.done}))endGame()}
function update(dt){
if(mode===2){updateClassic(dt);return}
if(breakPause>0){breakPause=Math.max(0,breakPause-dt);if(ratEscape){if(ratEscape.delay>0){ratEscape.delay=Math.max(0,ratEscape.delay-dt);if(ratEscape.delay===0&&splats.length)splats[splats.length-1].ingotVisible=false}else{ratEscape.t+=dt;ratEscape.x+=dt*1400;if(ratEscape.x>710)ratEscape=null}}particles.forEach(function(p){p.y-=.5;p.life--});particles=particles.filter(function(p){return p.life>0});if(breakPause===0&&lives<=0)endGame();return}
var speed=Math.min(300,124+caughtIngots*.8),targetEggs=ingotsPerStage();
spawn+=dt;
if(bonusIngotQueued&&!pendingIngot&&ingots.length===0)launchBonusIngot(speed);
if(!bonusIngotQueued&&!bonusIngotActive&&!pendingIngot&&batchLaunched<batchSize&&spawn>(shortWaveGap?.05:.8)){spawn=0;shortWaveGap=false;var availableLanes=[0,1,2,3].filter(function(n){return ingots.every(function(e){return e.lane!==n})});var ln=availableLanes[Math.floor(Math.random()*availableLanes.length)];pendingIngot={lane:ln,remaining:.35};laying[ln]=.35}
if(pendingIngot){pendingIngot.remaining-=dt;laying[pendingIngot.lane]=Math.max(0,pendingIngot.remaining);if(pendingIngot.remaining<=0){var ingotLane=pendingIngot.lane;splats=[];ingots.push({lane:ingotLane,x:lanes[ingotLane],y:78,vy:speed,rollStep:0,bump:0,checked:false,missed:false,done:false,w:[22,28,35][Math.floor(Math.random()*3)],h:[12,16,20][Math.floor(Math.random()*3)]});batchLaunched++;pendingIngot=null}}
for(var h=0;h<4;h++)if(!pendingIngot||pendingIngot.lane!==h)laying[h]=Math.max(0,laying[h]-dt);
var ingotMissed=false;
ingots.forEach(function(e){e.y+=e.vy*dt;e.bump=Math.max(0,e.bump-dt);while(e.rollStep<6&&e.y>=78+(e.rollStep+1)*(308/6)){e.rollStep++;e.bump=.12;rollClick(e.rollStep)}
if(!e.checked&&e.y>386){e.checked=true;if(e.lane===lane){e.done=true;ingotCaught(e)}else{e.missed=true;lives--;livesEl.textContent='♥ '.repeat(lives).trim()||'—';crack();queueBonusIngot()}}
if(e.missed&&e.y>=419){e.done=true;if(e.golden)bonusIngotActive=false;splats.push({x:e.x,y:437,life:999999,ingotVisible:true,ingot:{x:e.x,y:428,rollStep:e.rollStep,bump:0,w:e.w,h:e.h,golden:!!e.golden}});ingotMissed=true}});
if(ingotMissed){var fallen=splats[splats.length-1];ratEscape={x:fallen?fallen.x-55:lanes[lane]-55,t:0,delay:.28};ingots=[];pendingIngot=null;batchLaunched=0;laying=[0,0,0,0];spawn=0;breakPause=.72}
ingots=ingots.filter(function(e){return !e.done});
if(!ingotMissed&&!bonusIngotQueued&&!bonusIngotActive&&!pendingIngot&&batchLaunched===batchSize&&ingots.length===0){batchSize=ingotsPerStage();batchLaunched=0;spawn=0;shortWaveGap=true}
particles.forEach(function(p){p.y-=.5;p.life--});particles=particles.filter(function(p){return p.life>0});
if(lives<=0&&breakPause<=0&&!ingots.some(function(e){return e.missed&&!e.done}))endGame()}
function frame(t){if(!running||paused)return;var dt=Math.min((t-last)/1000||0,.04);last=t;update(dt);render();if(running&&!paused)raf=requestAnimationFrame(frame)}
function chooseLane(n){lane=Math.max(0,Math.min(3,n));document.querySelectorAll('[data-lane]').forEach(function(b){b.classList.toggle('active',Number(b.dataset.lane)===lane)});tick();render()}
function startGame(){audioReady();intro();startBtn.disabled=false;exitBtn.hidden=true;score=0;lives=4;caughtIngots=0;batchSize=1;batchLaunched=0;shortWaveGap=false;spawn=0;ingots=[];particles=[];splats=[];ratEscape=null;laying=[0,0,0,0];pendingIngot=null;breakPause=0;bonusIngotQueued=false;bonusIngotActive=false;bonusIngotWindowUsed=-1;lane=0;paused=false;running=true;last=performance.now();scoreEl.textContent='0';livesEl.textContent='♥ ♥ ♥ ♥';startBtn.textContent='ПАУЗА';overlay.classList.add('hidden');overlay.classList.remove('paused');overlay.classList.remove('game-over');chooseLane(0);cancelAnimationFrame(raf);raf=requestAnimationFrame(frame)}
function endGame(){running=false;cancelAnimationFrame(raf);startBtn.disabled=false;startBtn.textContent='ИГРАТЬ ЕЩЁ';exitBtn.hidden=false;if(score>best){best=score;bestEl.textContent=best;try{localStorage.setItem('volk-best-v2',String(best))}catch(e){}}overlayTitle.textContent='Игра окончена';overlayText.textContent='Счёт: '+score;overlay.classList.add('game-over');overlay.classList.remove('hidden');overlay.classList.remove('paused')}
function togglePause(){if(!running)return;if(!paused){paused=true;cancelAnimationFrame(raf);startBtn.textContent='ПРОДОЛЖИТЬ';overlayTitle.textContent='ПАУЗА';overlay.classList.add('paused');overlay.classList.remove('hidden')}else{paused=false;overlay.classList.add('hidden');overlay.classList.remove('paused');startBtn.textContent='ПАУЗА';last=performance.now();raf=requestAnimationFrame(frame)}}
function selectMode(next){if(next===mode)return;mode=next;var modeButton=document.getElementById('modeToggle');modeButton.textContent='Реж '+mode+' ▾';document.getElementById('modeOptions').classList.add('hidden');running=false;paused=false;cancelAnimationFrame(raf);score=0;lives=4;caughtIngots=0;batchSize=1;batchLaunched=0;shortWaveGap=false;spawn=0;ingots=[];particles=[];splats=[];ratEscape=null;laying=[0,0,0,0];pendingIngot=null;breakPause=0;bonusIngotQueued=false;bonusIngotActive=false;bonusIngotWindowUsed=-1;lane=0;scoreEl.textContent='0';livesEl.textContent='♥ ♥ ♥ ♥';startBtn.textContent='▶ ПУСК';exitBtn.hidden=true;overlay.classList.add('hidden');overlay.classList.remove('paused','game-over');document.querySelectorAll('[data-lane]').forEach(function(b){b.classList.toggle('active',Number(b.dataset.lane)===0)});render()}
document.getElementById('modeToggle').addEventListener('click',function(){document.getElementById('modeOptions').classList.toggle('hidden')});
document.querySelectorAll('[data-mode]').forEach(function(b){b.addEventListener('click',function(){selectMode(Number(b.dataset.mode))})});
document.addEventListener('click',function(e){if(!e.target.closest('.mode-picker'))document.getElementById('modeOptions').classList.add('hidden')});
startBtn.addEventListener('click',function(){if(!running){startGame();return}togglePause()});
exitBtn.addEventListener('click',function(){location.href='../games.html'});
document.querySelectorAll('[data-lane]').forEach(function(b){b.addEventListener('pointerdown',function(e){e.preventDefault();chooseLane(Number(b.dataset.lane))})});
document.addEventListener('keydown',function(e){if(e.key>='1'&&e.key<='4'){chooseLane(Number(e.key)-1);return}if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();chooseLane(lane===0?3:lane-1)}if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();chooseLane((lane+1)%4)}if(e.code==='Space'){e.preventDefault();togglePause()}});
soundBtn.addEventListener('click',function(){soundOn=!soundOn;soundBtn.textContent=soundOn?'♫ ЗВУК':'ЗВУК ВЫКЛ';soundBtn.setAttribute('aria-label',soundOn?'Звук включён':'Звук выключен');if(soundOn){audioReady();tick()}});
render();document.querySelector('[data-lane="0"]').classList.add('active');
})();