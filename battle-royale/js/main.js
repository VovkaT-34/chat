import * as THREE from "three";
import { defaults, WEAPONS, worldSize, playerSpeed } from "./constants.js";
import { clamp, rand, fmt } from "./utils.js";
import { createAudioSystem } from "./audio.js";
import { createCharacterModels } from "./models.js";
import { updateHud as updateHudModule, drawMiniMap as drawMiniMapModule, drawMap as drawMapModule } from "./hud.js";
import { bindScreenScroll as bindScreenScrollModule } from "./screen-scroll.js";
import { createGyroSystem } from "./gyro.js";
import { applySettingsToHud as applySettingsToHudModule, bindSettings as bindSettingsModule } from "./settings-ui.js";
import { createControls } from "./controls.js";
import { createMenuUI } from "./menu-ui.js";
import { createBotAI } from "./bot-ai.js";
import { setEditMode as setHudEditMode, saveLayout as saveHudLayout, loadLayout as loadHudLayout, bindEditor as bindHudEditor } from "./hud-layout.js";

const $ = id => document.getElementById(id);
const root=$("gameRoot"),canvas=$("world");
const ui={menu:$("menu"),settings:$("settings"),how:$("how"),pause:$("pause"),result:$("result"),map:$("mapScreen"),toast:$("toast")};
const storeKey="brut-last-survivor-settings-v1",layoutKey="brut-last-survivor-hud-v1";

let settings={...defaults},savedSettings={};try{savedSettings=JSON.parse(localStorage.getItem(storeKey)||"{}");settings={...settings,...savedSettings}}catch{}settings.cameraSensitivity=Number(savedSettings.cameraSensitivity??savedSettings.sensitivity??55);settings.adsSensitivity=Number(savedSettings.adsSensitivity??savedSettings.sensitivity??35);settings.joystickMode=savedSettings.joystickMode==="floating"?"floating":"fixed";settings.gyroEnabled=true;settings.gyroMode="always";
const audio=createAudioSystem(()=>settings);
const {getAudio,unlockAudio,tone,noiseBurst,playSfx,sound}=audio;
let renderer,scene,camera,clock,raycaster,sunLight;
let player,bots=[],loot=[],obstacles=[],bullets=[],particles=[],zoneRing;
let running=false,paused=false,gameOver=false,elapsed=0,zoneRadius=47,zoneStage=0,zoneTimer=180;
let kills=0,totalDamage=0,health=100,armor=0,ammo=12,reserve=48,weapon="ПИСТОЛЕТ",weaponType="pistol",medkits=2;

let activeWeaponId="p92",fireMode="SINGLE",weaponMagazines={p92:15},reserveByAmmo={"556":120,"762":90,"45":100,"9":60},triggerLocked=false;
const getWeapon=()=>WEAPONS.find(w=>w.id===activeWeaponId)||WEAPONS[9];
function selectWeapon(id){const w=WEAPONS.find(x=>x.id===id);if(!w)return;activeWeaponId=id;weapon=w.name;weaponType=w.type.toLowerCase();ammo=weaponMagazines[id]??w.mag;weaponMagazines[id]=ammo;fireMode=w.modes.includes(fireMode)?fireMode:w.modes[0];reloadUntil=0;if(player)setPersonWeapon(player,id);updateHud()}
function cycleWeapon(step){const i=WEAPONS.findIndex(w=>w.id===activeWeaponId);selectWeapon(WEAPONS[(i+step+WEAPONS.length)%WEAPONS.length].id);showToast("Оружие: "+weapon)}
function cycleFireMode(){const modes=getWeapon().modes;if(modes.length<2){showToast("Для этого оружия режим один");return}fireMode=modes[(modes.indexOf(fireMode)+1)%modes.length];showToast("Режим: "+fireMode);updateHud()}

let yaw=0,pitch=.18,aiming=false,crouching=false,prone=false,sprinting=false,fireHeld=false,jumpUntil=0,lastShot=0,reloadUntil=0,toastTimer=0;
let move={x:0,y:0},lookPointer=null,keys=new Set(),lastFrame=0;
let footstepTimer=0;

const materials={};
const v3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);



function showToast(message){ui.toast.textContent=message;ui.toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),1900)}
function openScreen(id){Object.values(ui).forEach(x=>x.classList?.remove("visible"));ui[id].classList.add("visible")}
function closeScreens(){Object.values(ui).forEach(x=>x.classList?.remove("visible"))}
function saveSettings(){try{localStorage.setItem(storeKey,JSON.stringify(settings))}catch{}}
const gyro=createGyroSystem({
  $,settings,saveSettings,isPortraitGame,
  isRunning:()=>running,isPaused:()=>paused,isGameOver:()=>gameOver,
  getYaw:()=>yaw,setYaw:value=>yaw=value,
  getPitch:()=>pitch,setPitch:value=>pitch=value
});






const controls=createControls({
  $,root,settings,screenToGamePoint,clamp,
  state:{
    get move(){return move},set move(value){move=value},
    get lookPointer(){return lookPointer},set lookPointer(value){lookPointer=value},
    get aiming(){return aiming},set aiming(value){aiming=value},
    get yaw(){return yaw},set yaw(value){yaw=value},
    get pitch(){return pitch},set pitch(value){pitch=value},
    get fireHeld(){return fireHeld},set fireHeld(value){fireHeld=value},
    get triggerLocked(){return triggerLocked},set triggerLocked(value){triggerLocked=value},
    get jumpUntil(){return jumpUntil},set jumpUntil(value){jumpUntil=value},
    get crouching(){return crouching},set crouching(value){crouching=value},
    get prone(){return prone},set prone(value){prone=value},
    get sprinting(){return sprinting},set sprinting(value){sprinting=value},
    keys,
    get running(){return running},
    get paused(){return paused}
  },
  actions:{cycleWeapon,cycleFireMode,sound,reload,heal,pickLoot,pauseMatch}
});

const menuUI=createMenuUI({
  $,root,ui,layoutKey,
  state:{
    get running(){return running},set running(value){running=value},
    get paused(){return paused},set paused(value){paused=value},
    get gameOver(){return gameOver},set gameOver(value){gameOver=value},
    get fireHeld(){return fireHeld},set fireHeld(value){fireHeld=value},
    get move(){return move},set move(value){move=value}
  },
  actions:{startMatch,pauseMatch,resumeMatch,openScreen,drawMap,setEditMode,closeScreens,saveLayout,showToast}
});

const botAI=createBotAI({
  v3,rand,
  state:{
    get bots(){return bots},
    get player(){return player},
    get health(){return health},set health(value){health=value},
    get armor(){return armor},set armor(value){armor=value}
  },
  actions:{collides,playSfx,updateHud,finish}
});

function mat(color,roughness=.9){const k=color+":"+roughness;if(!materials[k])materials[k]=new THREE.MeshStandardMaterial({color,roughness});return materials[k]}
const {createWeaponModel,setPersonWeapon,makePerson}=createCharacterModels({THREE,mat});
function box(w,h,d,color,x,y,z,group=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=settings.shadows;m.receiveShadow=true;group.add(m);return m}
function addObstacle(x,z,w,d,h=3,color="#a99c80"){const g=new THREE.Group();g.position.set(x,0,z);box(w,h,d,color,0,h/2,0,g);scene.add(g);obstacles.push({x,z,w,d,h,mesh:g});return g}

function buildWorld(){
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(worldSize,worldSize),mat("#536b49"));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;scene.add(ground);
  const path=new THREE.Mesh(new THREE.PlaneGeometry(13,worldSize),mat("#77745c"));
  path.rotation.x=-Math.PI/2;path.position.set(0,-.055,0);path.receiveShadow=true;scene.add(path);
  const hemi=new THREE.HemisphereLight("#dce8d0","#46513b",2.0);scene.add(hemi);
  sunLight=new THREE.DirectionalLight("#fff0d0",2.25);sunLight.position.set(-28,48,-22);sunLight.castShadow=settings.shadows;
  sunLight.shadow.mapSize.set(1024,1024);sunLight.shadow.camera.left=-62;sunLight.shadow.camera.right=62;sunLight.shadow.camera.top=62;sunLight.shadow.camera.bottom=-62;scene.add(sunLight);
  addObstacle(-19,-22,12,8,3.2,"#817c68");
  addObstacle(21,-25,10,9,3.5,"#8b8068");
  addObstacle(-28,13,9,12,3.1,"#777b68");
  addObstacle(24,19,12,8,3.4,"#8a806d");
  addObstacle(-3,31,15,6,2.8,"#777866");
  addObstacle(3,-38,8,7,3.1,"#817965");
  addObstacle(-40,-5,6,12,2.7,"#777b69");
  addObstacle(40,4,7,11,3.2,"#857d68");
  zoneRing=new THREE.Mesh(new THREE.TorusGeometry(47,.22,6,128),new THREE.MeshBasicMaterial({color:"#a9d8ee",transparent:true,opacity:.78}));
  zoneRing.rotation.x=-Math.PI/2;zoneRing.position.y=.24;scene.add(zoneRing);
  camera.position.set(0,5,1);camera.lookAt(0,1,-8);
}
function makeLoot(type,x,z){
  const colors={ammo:"#d7b95f",medkit:"#d36f61",armor:"#668fa0",weapon:"#b58b50"};
  const group=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,.12,12),mat("#303b32"));base.position.y=.12;base.castShadow=true;group.add(base);
  const crate=new THREE.Mesh(new THREE.BoxGeometry(.48,.36,.42),mat(colors[type]||"#b58b50"));crate.position.y=.36;crate.castShadow=true;crate.receiveShadow=true;group.add(crate);
  if(type==="medkit"){
    const crossV=new THREE.Mesh(new THREE.BoxGeometry(.10,.25,.035),mat("#fff0dc"));
    const crossH=new THREE.Mesh(new THREE.BoxGeometry(.25,.10,.035),mat("#fff0dc"));
    crossV.position.set(0,.38,.224);crossH.position.set(0,.38,.224);group.add(crossV,crossH);
  }else if(type==="weapon"){
    const weaponModel=createWeaponModel("p92");weaponModel.scale.setScalar(.38);weaponModel.position.set(0,.53,0);group.add(weaponModel);
  }else{
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(.08,.38,.44),mat("#e9e2c9"));stripe.position.y=.36;group.add(stripe);
  }
  group.position.set(x,0,z);scene.add(group);loot.push({type,x,z,mesh:group,active:true});return group;
}




function makeBot(i){const botWeapon=["scar","m416","akm","m16","mk14","mk12","svd","kar98k","ump45"][i%9];const g=makePerson(["#725b4b","#536a52","#6b5865","#526778"][i%4],true,botWeapon);let x,z;do{x=rand(-45,45);z=rand(-45,45)}while(Math.hypot(x,z)<15||collides(x,z,.8));g.position.set(x,0,z);scene.add(g);bots.push({mesh:g,x,z,health:100,armor:i%3===0?25:0,alive:true,shoot:rand(1,4),wander:rand(0,6),target:null})}
function initWorld(){scene=new THREE.Scene();scene.background=new THREE.Color("#aebd9a");scene.fog=new THREE.Fog("#aebd9a",72,138);renderer=new THREE.WebGLRenderer({canvas,antialias:settings.quality!=="low",powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,settings.quality==="high"?1.6:1.15));renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=settings.shadows&&settings.quality!=="low";renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,180);clock=new THREE.Clock();raycaster=new THREE.Raycaster();buildWorld();player=makePerson("#496b78");scene.add(player);for(let i=0;i<12;i++)makeBot(i);for(let i=0;i<24;i++){let x,z,tries=0;do{x=rand(-47,47);z=rand(-47,47);tries++}while((Math.hypot(x,z)<8||collides(x,z,.7))&&tries<30);if(tries<30)makeLoot(["ammo","ammo","medkit","armor","weapon"][i%5],x,z)}resize();applySettingsToHud();animate()}
function isPortraitGame(){return innerHeight>innerWidth&&innerWidth<=900}
function screenToGamePoint(x,y){return isPortraitGame()?{x:y,y:innerWidth-x}:{x,y}}
function resize(){if(!renderer)return;const portrait=isPortraitGame();const viewWidth=portrait?innerHeight:innerWidth,viewHeight=portrait?innerWidth:innerHeight;camera.aspect=viewWidth/viewHeight;camera.updateProjectionMatrix();renderer.setSize(viewWidth,viewHeight,false);$("rotateNotice").style.display="none"}
function collides(x,z,r=.55){for(const o of obstacles){if(x>o.x-o.w/2-r&&x<o.x+o.w/2+r&&z>o.z-o.d/2-r&&z<o.z+o.d/2+r)return true}return Math.abs(x)>53||Math.abs(z)>53}
function updatePlayer(dt){if(!player)return;let mx=move.x,my=move.y;if(keys.has("KeyW")||keys.has("ArrowUp"))my-=1;if(keys.has("KeyS")||keys.has("ArrowDown"))my+=1;if(keys.has("KeyA")||keys.has("ArrowLeft"))mx-=1;if(keys.has("KeyD")||keys.has("ArrowRight"))mx+=1;const len=Math.hypot(mx,my);if(len>1){mx/=len;my/=len}const forward=v3(-Math.sin(yaw),0,-Math.cos(yaw)),right=v3(Math.cos(yaw),0,-Math.sin(yaw));const speed=playerSpeed*(prone?.2:crouching?.48:sprinting?1.55:1)*(aiming?.78:1);const delta=forward.multiplyScalar(-my*speed*dt).add(right.multiplyScalar(mx*speed*dt));if(len>.18){footstepTimer-=dt;if(footstepTimer<=0){playSfx("step");footstepTimer=sprinting?.28:crouching?.62:prone?.9:.43}}else footstepTimer=0;const nx=player.position.x+delta.x,nz=player.position.z+delta.z;if(!collides(nx,player.position.z))player.position.x=nx;if(!collides(player.position.x,nz))player.position.z=nz;player.rotation.y=yaw;if(performance.now()<jumpUntil)player.position.y=Math.sin((jumpUntil-performance.now())/420*Math.PI)*.8;else player.position.y=0;player.scale.y=prone?.52:crouching?.78:1;const target=v3(player.position.x+Math.sin(yaw)*9,2.6+pitch*7,player.position.z+Math.cos(yaw)*9);const desired=v3(player.position.x+Math.sin(yaw)*8,2.8+pitch*7,player.position.z+Math.cos(yaw)*8);const offset=v3(Math.sin(yaw)*7,aiming?2.35:3.25,Math.cos(yaw)*7);camera.position.lerp(v3(player.position.x+offset.x,player.position.y+offset.y,player.position.z+offset.z),1-Math.exp(-dt*8));camera.fov=aiming?43:64;camera.updateProjectionMatrix();camera.lookAt(player.position.x-Math.sin(yaw)*12,player.position.y+1.45+pitch*10,player.position.z-Math.cos(yaw)*12);void target;void desired}
function shoot(){const w=getWeapon(),now=performance.now();if(!running||paused||gameOver||root.classList.contains("editing")||reloadUntil>now||now-lastShot<w.rate)return;if(fireMode!=="AUTO"&&triggerLocked)return;const rounds=fireMode==="BURST"?3:1;if(ammo<rounds){showToast("Нет патронов");if(settings.autoReload&&reserveByAmmo[w.ammo]>0)reload();return}triggerLocked=true;lastShot=now;ammo-=rounds;weaponMagazines[activeWeaponId]=ammo;updateHud();playSfx("gun");camera.updateMatrixWorld();let aimDirection=new THREE.Vector3();camera.getWorldDirection(aimDirection);if(settings.aimAssist){let best=null,bestAngle=.065;for(const b of bots){if(!b.alive)continue;const to=v3(b.x,1.25,b.z).sub(camera.position),dist=to.length();if(dist>w.range)continue;const angle=aimDirection.angleTo(to.normalize());if(angle<bestAngle){bestAngle=angle;best=b}}if(best)aimDirection.copy(v3(best.x,1.25,best.z).sub(camera.position).normalize())}raycaster.set(camera.position,aimDirection);const hits=raycaster.intersectObjects(bots.filter(b=>b.alive).map(b=>b.mesh),true);const blocks=raycaster.intersectObjects(obstacles.map(o=>o.mesh),true);if(blocks.length&&(!hits.length||blocks[0].distance<hits[0].distance)){showToast("Попадание в укрытие");return}if(hits.length){playSfx("hit");const hitObject=hits[0].object;const bot=bots.find(b=>b.alive&&(()=>{let node=hitObject;while(node){if(node===b.mesh)return true;node=node.parent}return false})());if(bot&&camera.position.distanceTo(bot.mesh.position)<w.range){for(let shot=0;shot<rounds&&bot.health>0;shot++){let damage=w.damage;if(aiming)damage*=1.25;const absorbed=Math.min(bot.armor,damage*.45);bot.armor-=absorbed;bot.health-=damage-absorbed;totalDamage+=damage;}if(bot.health<=0){bot.alive=false;scene.remove(bot.mesh);kills++;makeLoot("ammo",bot.x,bot.z);if(Math.random()>.55)makeLoot("medkit",bot.x+.7,bot.z);showToast("Противник устранён")}else showToast("Попадание");updateHud()}}if(settings.effects){const p=new THREE.Mesh(new THREE.SphereGeometry(.07,6,6),new THREE.MeshBasicMaterial({color:"#ffdb85"}));p.position.copy(camera.position).add(raycaster.ray.direction.clone().multiplyScalar(1.2));scene.add(p);particles.push({mesh:p,life:.12})}}
function reload(){const w=getWeapon(),weaponId=activeWeaponId;if(reloadUntil>performance.now()||ammo>=w.mag||reserveByAmmo[w.ammo]<=0)return;const duration=w.reload;reloadUntil=performance.now()+duration;showToast("Перезарядка…");playSfx("reload");setTimeout(()=>{if(gameOver||activeWeaponId!==weaponId)return;const n=Math.min(w.mag-ammo,reserveByAmmo[w.ammo]);ammo+=n;reserveByAmmo[w.ammo]-=n;weaponMagazines[weaponId]=ammo;reloadUntil=0;updateHud()},duration)}
function heal(){if(medkits<=0||health>=95)return;medkits--;health=Math.min(100,health+45);updateHud();showToast("Аптечка использована");playSfx("heal")}
function pickLoot(force=false){for(const item of loot){if(!item.active||Math.hypot(player.position.x-item.x,player.position.z-item.z)>2.2)continue;if(!settings.autoLoot&&!force)continue;item.active=false;scene.remove(item.mesh);if(item.type==="ammo")reserveByAmmo[getWeapon().ammo]+=24;if(item.type==="medkit")medkits=Math.min(5,medkits+1);if(item.type==="armor")armor=Math.min(100,armor+30);if(item.type==="weapon"){cycleWeapon(1);reserveByAmmo[getWeapon().ammo]+=30}playSfx("pickup");showToast(item.type==="weapon"?"Подобран автомат":item.type==="medkit"?"Подобрана аптечка":item.type==="armor"?"Броня усилена":"Патроны подобраны");updateHud()}}
function updateZone(dt){elapsed+=dt;zoneTimer-=dt;if(zoneTimer<=0&&zoneStage<4){zoneStage++;zoneRadius=[35,25,17,10][zoneStage-1];zoneTimer=zoneStage===4?999:75;showToast("Безопасная зона сужается");playSfx("zone")}zoneRing.scale.set(zoneRadius/47,zoneRadius/47,1);zoneRing.position.set(0,.22,0);const d=Math.hypot(player.position.x,player.position.z);if(d>zoneRadius){health=Math.max(0,health-dt*(zoneStage>=3?9:5));updateHud();$("zoneWarning").textContent="ВНЕ БЕЗОПАСНОЙ ЗОНЫ";if(health<=0)finish(false)}else $("zoneWarning").textContent="";for(const b of bots){if(b.alive&&Math.hypot(b.x,b.z)>zoneRadius+4){b.health-=dt*7;if(b.health<=0){b.alive=false;scene.remove(b.mesh)}}}const alive=bots.filter(b=>b.alive).length+1;$("aliveCount").textContent=alive;$("zoneClock").textContent=fmt(zoneTimer)}

function updateHud(){updateHudModule({$,health,armor,ammo,reserveByAmmo,getWeapon,weapon,fireMode,medkits,kills,bots})}
function finish(win){if(gameOver)return;gameOver=true;running=false;fireHeld=false;$("resultTitle").textContent=win?"ПОБЕДА":"ПОРАЖЕНИЕ";$("resultTitle").style.color=win?"#f0d58c":"#e58d78";$("resultKills").textContent=kills;$("resultTime").textContent=fmt(elapsed);$("resultDamage").textContent=Math.round(totalDamage);openScreen("result");playSfx(win?"win":"lose")}
function checkWin(){if(bots.every(b=>!b.alive))finish(true)}


function drawMiniMap(){drawMiniMapModule({$,obstacles,zoneRadius,bots,player,yaw})}
function drawMap(){drawMapModule({$,obstacles,zoneRadius,player,bots})}
function resetMatch(){if(!renderer)initWorld();footstepTimer=0;move={x:0,y:0};keys.clear();lookPointer=null;fireHeld=false;triggerLocked=false;aiming=false;crouching=false;prone=false;sprinting=false;jumpUntil=0;lastShot=0;reloadUntil=0;$("aimButton").classList.remove("active");$("crouchButton").classList.remove("active");$("proneButton").classList.remove("active");$("sprintButton").classList.remove("active");const knob=$("joystick").querySelector(".joy-knob");knob.style.left="50%";knob.style.top="50%";for(const b of bots)scene.remove(b.mesh);for(const l of loot)scene.remove(l.mesh);for(const p of particles)scene.remove(p.mesh);bots=[];loot=[];particles=[];bullets=[];obstacles=[];scene.clear();buildWorld();scene.add(player);player.position.set(0,0,-7);for(let i=0;i<12;i++)makeBot(i);for(let i=0;i<24;i++){let x,z,tries=0;do{x=rand(-47,47);z=rand(-47,47);tries++}while((Math.hypot(x,z)<8||collides(x,z,.7))&&tries<30);if(tries<30)makeLoot(["ammo","ammo","medkit","armor","weapon"][i%5],x,z)}health=100;armor=0;activeWeaponId="p92";fireMode="SINGLE";weaponMagazines={p92:15};reserveByAmmo={"556":120,"762":90,"45":100,"9":60};ammo=15;reserve=60;weapon="P92";weaponType="pistol";triggerLocked=false;setPersonWeapon(player,"p92");medkits=2;kills=0;totalDamage=0;elapsed=0;zoneRadius=47;zoneStage=0;zoneTimer=180;yaw=0;pitch=.18;gameOver=false;paused=false;running=true;player.rotation.set(0,0,0);updateHud();closeScreens();lastFrame=performance.now();showToast("Найдите оружие и выживите")}
function animate(now){requestAnimationFrame(animate);if(!renderer||!scene||!camera)return;const dt=Math.min(clock.getDelta(),.05);if(running&&!paused&&!gameOver){gyro.apply();updatePlayer(dt);botAI.updateBots(dt);updateZone(dt);pickLoot();const nearLoot=loot.some(item=>item.active&&Math.hypot(player.position.x-item.x,player.position.z-item.z)<2.8);$("lootButton").classList.toggle("available",nearLoot&&!settings.autoLoot);if(fireHeld)shoot();checkWin();for(let i=particles.length-1;i>=0;i--){particles[i].life-=dt;if(particles[i].life<=0){scene.remove(particles[i].mesh);particles.splice(i,1)}}}drawMiniMap();renderer.render(scene,camera)}
function startMatch(){unlockAudio();const gyroRequest=gyro.requestAccess();resetMatch();gyroRequest.then(gyroReady=>{if(!gyroReady&&running)showToast("Гироскоп недоступен: проверьте разрешение датчика")})}
function pauseMatch(){if(!running)return;paused=true;fireHeld=false;sprinting=false;move={x:0,y:0};openScreen("pause")}
function resumeMatch(){paused=false;closeScreens()}
function applySettingsToHud(){applySettingsToHudModule({root,settings,$})}
function bindSettings(){bindSettingsModule({
  $,settings,applySettingsToHud,saveSettings,getRenderer:()=>renderer,getSunLight:()=>sunLight,
  root,setEditMode,isPaused:()=>paused,isRunning:()=>running,isGameOver:()=>gameOver,
  openScreen,closeScreens,screenToGamePoint
})}

function bindScreenScroll(){bindScreenScrollModule($,screenToGamePoint)}
function setEditMode(on){setHudEditMode(on,{root,$,showToast,saveLayout})}
function saveLayout(){saveHudLayout({layoutKey,root})}
function loadLayout(){loadHudLayout({layoutKey,isPortraitGame})}
function bindEditor(){bindHudEditor({root,screenToGamePoint,clamp,saveLayout})}
function init(){try{menuUI.bind();initWorld();controls.bind();gyro.bind();bindSettings();bindScreenScroll();bindEditor();loadLayout();applySettingsToHud();updateHud();window.addEventListener("resize",resize);window.addEventListener("orientationchange",resize);document.addEventListener("visibilitychange",()=>{if(document.hidden&&running&&!paused)pauseMatch()})}catch(err){console.error(err);showToast("Не удалось запустить 3D-графику. Попробуйте другой браузер.")}}
init();
