import { clamp } from "./utils.js";

export function createGyroSystem({
  $,settings,saveSettings,isPortraitGame,
  isRunning,isPaused,isGameOver,
  getYaw,setYaw,getPitch,setPitch
}){
  let previous=null,current=null,pendingYaw=0,pendingPitch=0;
  let requestAccess=async()=>false;

  function apply(){
    if(!isRunning()||isPaused()||isGameOver())return;
    const yawDelta=pendingYaw,pitchDelta=pendingPitch;
    pendingYaw=0;pendingPitch=0;
    setYaw(getYaw()-yawDelta*settings.gyroSensitivity*.00022);
    setPitch(clamp(getPitch()+pitchDelta*settings.gyroSensitivity*.00016,-.32,.55));
  }

  function bind(){
    const status=$("gyroStatus"),calibrate=$("gyroCalibrate");
    const supported=typeof DeviceOrientationEvent!=="undefined";
    function updateStatus(message){status.textContent=message}
    function onOrientation(e){
      if(!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
      const physicalAngle=(screen.orientation&&Number.isFinite(screen.orientation.angle)?screen.orientation.angle:(Number(window.orientation)||0)+360)%360;
      current={beta:e.beta,gamma:e.gamma,angle:(physicalAngle+(isPortraitGame()?90:0))%360};
      if(!previous){previous={...current};return}
      const db=current.beta-previous.beta,dg=current.gamma-previous.gamma;
      previous={...current};
      if(!isRunning()||isPaused()||isGameOver()){pendingYaw=0;pendingPitch=0;return}
      let yawDelta,pitchDelta;
      const angle=current.angle;
      if(angle>=45&&angle<135){yawDelta=db;pitchDelta=-dg}
      else if(angle>=225&&angle<315){yawDelta=-db;pitchDelta=dg}
      else if(angle>=135&&angle<225){yawDelta=-dg;pitchDelta=-db}
      else{yawDelta=dg;pitchDelta=db}
      pendingYaw+=yawDelta;pendingPitch+=pitchDelta;
    }
    window.addEventListener("deviceorientation",onOrientation);
    requestAccess=async()=>{
      if(!supported){updateStatus("Устройство не поддерживает датчик ориентации");return false}
      try{
        if(typeof DeviceOrientationEvent.requestPermission==="function"){
          const result=await DeviceOrientationEvent.requestPermission();
          if(result!=="granted"){updateStatus("Браузер не разрешил доступ к гироскопу");return false}
        }
        settings.gyroEnabled=true;settings.gyroMode="always";
        previous=current?{...current}:null;pendingYaw=0;pendingPitch=0;
        saveSettings();updateStatus(previous?"Гироскоп активен":"Ожидание данных датчика");
        return true;
      }catch(err){updateStatus("Не удалось получить разрешение гироскопа");return false}
    };
    calibrate.addEventListener("click",()=>{
      if(!current){updateStatus("Данных датчика пока нет");return}
      previous={...current};pendingYaw=0;pendingPitch=0;updateStatus("Гироскоп откалиброван");
    });
    calibrate.disabled=!supported;
    updateStatus(supported?"Гироскоп включается автоматически при запуске матча":"Датчик ориентации не поддерживается");
  }

  return {bind,apply,requestAccess:()=>requestAccess()};
}
