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
import { createZoneSystem } from "./zone.js";
import { createCombatSystem } from "./combat.js";
import { createPlayerController } from "./player-controller.js";
import { createWorldSystem } from "./world.js";
import { createGameLoop } from "./game-loop.js";
import { createWeaponSystem } from "./weapon-system.js";
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
let running=false,paused=false,gameOver=false,elapsed=0,zoneRadius=200,zoneStage=0,zoneTimer=180;
let playerNoise={x:0,z:0,expires:0,range:90,serial:0};
let kills=0,totalDamage=0,health=100,armor=0,ammo=12,reserve=48,weapon="ПИСТОЛЕТ",weaponType="pistol",medkits=2;

let activeWeaponId="p92",fireMode="SINGLE",weaponMagazines={p92:15},reserveByAmmo={"556":120,"762":90,"45":100,"9":60},triggerLocked=false;
let weaponSystem;
const getWeapon=()=>weaponSystem.getWeapon();
function selectWeapon(id){return weaponSystem.selectWeapon(id)}
function cycleWeapon(step){return weaponSystem.cycleWeapon(step)}
function cycleFireMode(){return weaponSystem.cycleFireMode()}

let yaw=0,pitch=.18,aiming=false,crouching=false,prone=false,sprinting=false,fireHeld=false,jumpUntil=0,lastShot=0,reloadUntil=0,toastTimer=0;
let move={x:0,y:0},lookPointer=null,keys=new Set(),lastFrame=0;
let footstepTimer=0;

const materials={};
let worldSystem;
const v3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);



function emitNoise(x,z,range=90){playerNoise={x,z,expires:6,range,serial:playerNoise.serial+1}}
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






const playerController=createPlayerController({
  v3,playerSpeed,
  state:{
    get player(){return player},
    get camera(){return camera},
    get move(){return move},
    keys,
    get yaw(){return yaw},
    get pitch(){return pitch},
    get prone(){return prone},
    get crouching(){return crouching},
    get sprinting(){return sprinting},
    get aiming(){return aiming},
    get footstepTimer(){return footstepTimer},set footstepTimer(value){footstepTimer=value},
    get jumpUntil(){return jumpUntil}
  },
  actions:{playSfx,collides}
});

const combat=createCombatSystem({
  THREE,v3,
  state:{
    get running(){return running},
    get paused(){return paused},
    get gameOver(){return gameOver},
    get reloadUntil(){return reloadUntil},set reloadUntil(value){reloadUntil=value},
    get lastShot(){return lastShot},set lastShot(value){lastShot=value},
    get fireMode(){return fireMode},
    get triggerLocked(){return triggerLocked},set triggerLocked(value){triggerLocked=value},
    get ammo(){return ammo},set ammo(value){ammo=value},
    get weaponMagazines(){return weaponMagazines},
    get activeWeaponId(){return activeWeaponId},
    get reserveByAmmo(){return reserveByAmmo},
    get settings(){return settings},
    get aiming(){return aiming},
    get bots(){return bots},
    get camera(){return camera},
    get raycaster(){return raycaster},
    get obstacles(){return obstacles},
    get totalDamage(){return totalDamage},set totalDamage(value){totalDamage=value},
    get scene(){return scene},
    get kills(){return kills},set kills(value){kills=value},
    get particles(){return particles},
    get medkits(){return medkits},set medkits(value){medkits=value},
    get health(){return health},set health(value){health=value},
    get armor(){return armor},set armor(value){armor=value},
    get loot(){return loot},
    get player(){return player}
  },
  actions:{root,getWeapon,showToast,playSfx,updateHud,makeLoot,cycleWeapon,emitNoise}
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
  actions:{cycleWeapon,cycleFireMode,sound,reload:combat.reload,heal:combat.heal,pickLoot:combat.pickLoot,pauseMatch}
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
    get playerNoise(){return playerNoise},
    get health(){return health},set health(value){health=value},
    get armor(){return armor},set armor(value){armor=value}
  },
  actions:{collides,playSfx,updateHud,finish}
});

const zoneSystem=createZoneSystem({
  $,
  state:{
    get bots(){return bots},
    get player(){return player},
    get zoneRing(){return zoneRing},
    get elapsed(){return elapsed},set elapsed(value){elapsed=value},
    get zoneTimer(){return zoneTimer},set zoneTimer(value){zoneTimer=value},
    get zoneStage(){return zoneStage},set zoneStage(value){zoneStage=value},
    get zoneRadius(){return zoneRadius},set zoneRadius(value){zoneRadius=value},
    get health(){return health},set health(value){health=value}
  },
  actions:{showToast,playSfx,updateHud,finish,sceneRemove:mesh=>scene.remove(mesh),fmt}
});

function mat(color,roughness=.9){const k=color+":"+roughness;if(!materials[k])materials[k]=new THREE.MeshStandardMaterial({color,roughness});return materials[k]}
const {createWeaponModel,setPersonWeapon,makePerson}=createCharacterModels({THREE,mat});
weaponSystem=createWeaponSystem({
  WEAPONS,
  state:{
    get activeWeaponId(){return activeWeaponId},set activeWeaponId(value){activeWeaponId=value},
    get weapon(){return weapon},set weapon(value){weapon=value},
    get weaponType(){return weaponType},set weaponType(value){weaponType=value},
    get ammo(){return ammo},set ammo(value){ammo=value},
    get weaponMagazines(){return weaponMagazines},
    get fireMode(){return fireMode},set fireMode(value){fireMode=value},
    set reloadUntil(value){reloadUntil=value},
    get player(){return player}
  },
  actions:{setPersonWeapon,updateHud,showToast}
});
worldSystem=createWorldSystem({
  THREE,worldSize,settings,rand,mat,createWeaponModel,makePerson,
  state:{
    get scene(){return scene},
    get camera(){return camera},
    get obstacles(){return obstacles},
    get loot(){return loot},
    get bots(){return bots},
    set sunLight(value){sunLight=value},
    set zoneRing(value){zoneRing=value}
  }
});
function buildWorld(){return worldSystem.buildWorld()}
function makeLoot(type,x,z){return worldSystem.makeLoot(type,x,z)}
function makeBot(i){return worldSystem.makeBot(i)}
function collides(x,z,r=.55){return worldSystem.collides(x,z,r)}
function initWorld(){scene=new THREE.Scene();scene.background=new THREE.Color("#aebd9a");scene.fog=new THREE.Fog("#aebd9a",260,430);renderer=new THREE.WebGLRenderer({canvas,antialias:settings.quality!=="low",powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,settings.quality==="high"?1.6:1.15));renderer.setSize(innerWidth,innerHeight,false);renderer.shadowMap.enabled=settings.shadows&&settings.quality!=="low";renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.1,520);clock=new THREE.Clock();raycaster=new THREE.Raycaster();buildWorld();player=makePerson("#496b78");scene.add(player);for(let i=0;i<12;i++)makeBot(i);for(let i=0;i<24;i++){let x,z,tries=0;do{x=rand(-220,220);z=rand(-220,220);tries++}while((Math.hypot(x,z)<24||collides(x,z,.7))&&tries<30);if(tries<30)makeLoot(["ammo","ammo","medkit","armor","weapon"][i%5],x,z)}resize();applySettingsToHud();animate()}
function isPortraitGame(){return innerHeight>innerWidth&&innerWidth<=900}
function screenToGamePoint(x,y){return isPortraitGame()?{x:y,y:innerWidth-x}:{x,y}}
function resize(){if(!renderer)return;const portrait=isPortraitGame();const viewWidth=portrait?innerHeight:innerWidth,viewHeight=portrait?innerWidth:innerHeight;camera.aspect=viewWidth/viewHeight;camera.updateProjectionMatrix();renderer.setSize(viewWidth,viewHeight,false);$("rotateNotice").style.display="none"}
function updateHud(){updateHudModule({$,health,armor,ammo,reserveByAmmo,getWeapon,weapon,fireMode,medkits,kills,bots})}
function finish(win){if(gameOver)return;gameOver=true;running=false;fireHeld=false;$("resultTitle").textContent=win?"ПОБЕДА":"ПОРАЖЕНИЕ";$("resultTitle").style.color=win?"#f0d58c":"#e58d78";$("resultKills").textContent=kills;$("resultTime").textContent=fmt(elapsed);$("resultDamage").textContent=Math.round(totalDamage);openScreen("result");playSfx(win?"win":"lose")}

function drawMiniMap(){drawMiniMapModule({$,obstacles,zoneRadius,bots,player,yaw,worldSize})}
function drawMap(){drawMapModule({$,obstacles,zoneRadius,player,bots,worldSize})}
function resetMatch(){if(!renderer)initWorld();footstepTimer=0;move={x:0,y:0};keys.clear();lookPointer=null;fireHeld=false;triggerLocked=false;aiming=false;crouching=false;prone=false;sprinting=false;jumpUntil=0;lastShot=0;reloadUntil=0;$("aimButton").classList.remove("active");$("crouchButton").classList.remove("active");$("proneButton").classList.remove("active");$("sprintButton").classList.remove("active");const knob=$("joystick").querySelector(".joy-knob");knob.style.left="50%";knob.style.top="50%";for(const b of bots)scene.remove(b.mesh);for(const l of loot)scene.remove(l.mesh);for(const p of particles)scene.remove(p.mesh);bots=[];loot=[];particles=[];bullets=[];obstacles=[];scene.clear();buildWorld();scene.add(player);player.position.set(0,0,-7);for(let i=0;i<12;i++)makeBot(i);for(let i=0;i<24;i++){let x,z,tries=0;do{x=rand(-220,220);z=rand(-220,220);tries++}while((Math.hypot(x,z)<8||collides(x,z,.7))&&tries<30);if(tries<30)makeLoot(["ammo","ammo","medkit","armor","weapon"][i%5],x,z)}health=100;armor=0;activeWeaponId="p92";fireMode="SINGLE";weaponMagazines={p92:15};reserveByAmmo={"556":120,"762":90,"45":100,"9":60};ammo=15;reserve=60;weapon="P92";weaponType="pistol";triggerLocked=false;setPersonWeapon(player,"p92");medkits=2;kills=0;totalDamage=0;elapsed=0;playerNoise={x:0,z:0,expires:0,range:90,serial:playerNoise.serial+1};zoneRadius=200;zoneStage=0;zoneTimer=180;yaw=0;pitch=.18;gameOver=false;paused=false;running=true;player.rotation.set(0,0,0);updateHud();closeScreens();lastFrame=performance.now();showToast("Найдите оружие и выживите")}
const gameLoop=createGameLoop({
  state:{
    get renderer(){return renderer},
    get scene(){return scene},
    get camera(){return camera},
    get clock(){return clock},
    get running(){return running},
    get paused(){return paused},
    get gameOver(){return gameOver},
    get loot(){return loot},
    get player(){return player},
    get settings(){return settings},
    get fireHeld(){return fireHeld},
    get particles(){return particles}
  },
  actions:{
    gyroApply:()=>gyro.apply(),
    updatePlayer:dt=>playerController.updatePlayer(dt),
    updateBots:dt=>botAI.updateBots(dt),
    updateZone:dt=>zoneSystem.updateZone(dt),
    pickLoot:()=>combat.pickLoot(),
    setLootAvailable:value=>$("lootButton").classList.toggle("available",value),
    shoot:()=>combat.shoot(),
    checkWin:()=>zoneSystem.checkWin(),
    drawMiniMap
  }
});
function animate(now){gameLoop.animate(now)}
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
