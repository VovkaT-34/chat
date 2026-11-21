export function applySettingsToHud({root,settings,$}){
  root.style.setProperty("--btn-scale",settings.buttonSize/100);
  root.style.setProperty("--reticle-color",settings.reticle);
  root.style.setProperty("--btn-opacity",settings.buttonOpacity/100);
  document.querySelectorAll(".action-btn").forEach(b=>{
    b.style.opacity=settings.buttonOpacity/100;
    b.style.transform="scale("+settings.buttonSize/100+")";
  });
  $("joystick").style.opacity=settings.buttonOpacity/100;
  $("joystick").style.transform="scale("+settings.buttonSize/100+")";
  $("gyroSensitivity").value=settings.gyroSensitivity;
  $("gyroSensValue").textContent=settings.gyroSensitivity+"%";
  $("cameraSensitivity").value=settings.cameraSensitivity;
  $("cameraSensValue").textContent=settings.cameraSensitivity+"%";
  $("adsSensitivity").value=settings.adsSensitivity;
  $("adsSensValue").textContent=settings.adsSensitivity+"%";
  $("joystickMode").value=settings.joystickMode;
  $("buttonSize").value=settings.buttonSize;
  $("sizeValue").textContent=settings.buttonSize+"%";
  $("buttonOpacity").value=settings.buttonOpacity;
  $("opacityValue").textContent=settings.buttonOpacity+"%";
  $("quality").value=settings.quality;
  $("shadows").checked=settings.shadows;
  $("effects").checked=settings.effects;
  $("autoLoot").checked=settings.autoLoot;
  $("aimAssist").checked=settings.aimAssist;
  $("autoReload").checked=settings.autoReload;
  $("reticle").value=settings.reticle;
  $("volume").value=settings.volume;
  $("volumeValue").textContent=settings.volume+"%";
  $("soundEnabled").checked=settings.soundEnabled;
}

export function bindSettings({
  $,settings,applySettingsToHud,saveSettings,getRenderer,getSunLight,
  root,setEditMode,isPaused,isRunning,isGameOver,openScreen,closeScreens,screenToGamePoint
}){
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{
    document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("selected",x===b));
    document.querySelectorAll("[data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===b.dataset.tab));
  }));
  const range=(id,key,out,suffix="%")=>$(id).addEventListener("input",()=>{
    settings[key]=Number($(id).value);
    $(out).textContent=settings[key]+suffix;
    applySettingsToHud();
  });
  range("gyroSensitivity","gyroSensitivity","gyroSensValue");
  range("cameraSensitivity","cameraSensitivity","cameraSensValue");
  range("adsSensitivity","adsSensitivity","adsSensValue");
  $("joystickMode").addEventListener("change",()=>{
    settings.joystickMode=$("joystickMode").value;
    if(settings.joystickMode==="fixed"){
      $("joystick").style.left="";
      $("joystick").style.top="";
      $("joystick").style.right="";
      $("joystick").style.bottom="";
    }
  });
  range("buttonSize","buttonSize","sizeValue");
  range("buttonOpacity","buttonOpacity","opacityValue");
  range("volume","volume","volumeValue");
  ["quality","reticle"].forEach(id=>$(id).addEventListener("change",()=>settings[id]=$(id).value));
  ["shadows","effects","autoLoot","aimAssist","autoReload","soundEnabled"].forEach(id=>$(id).addEventListener("change",()=>settings[id]=$(id).checked));
  $("applySettings").onclick=()=>{
    saveSettings();
    const renderer=getRenderer(),sunLight=getSunLight();
    if(renderer){
      renderer.shadowMap.enabled=settings.shadows&&settings.quality!=="low";
      if(sunLight)sunLight.castShadow=settings.shadows;
      renderer.setPixelRatio(Math.min(devicePixelRatio||1,settings.quality==="high"?1.6:1.15));
      renderer.setSize(innerWidth,innerHeight,false);
    }
    if(root.classList.contains("editing"))setEditMode(false);
    if(isPaused())openScreen("pause");
    else if(!isRunning()&&!isGameOver())openScreen("menu");
    else closeScreens();
  };
  document.querySelectorAll(".settings-scroll-rail").forEach(rail=>{
    let pointerId=null,lastY=0;
    rail.addEventListener("pointerdown",e=>{
      e.preventDefault();pointerId=e.pointerId;
      lastY=screenToGamePoint(e.clientX,e.clientY).y;
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener("pointermove",e=>{
      if(e.pointerId!==pointerId)return;
      e.preventDefault();
      const y=screenToGamePoint(e.clientX,e.clientY).y;
      const delta=lastY-y;lastY=y;
      const panel=$("settings").querySelector(".settings-dialog");
      panel.scrollTop+=delta;
    });
    const stop=()=>{pointerId=null};
    ["pointerup","pointercancel","lostpointercapture"].forEach(type=>rail.addEventListener(type,stop));
  });
}
