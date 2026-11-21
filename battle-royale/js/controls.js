export function createControls({$,root,settings,screenToGamePoint,clamp,state,actions}){
  function bindHold(id,down,up){
    const el=$(id);
    el.addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing"))return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      down();
    });
    ["pointerup","pointercancel","lostpointercapture"].forEach(n=>el.addEventListener(n,e=>{
      e.preventDefault();
      up();
    }));
  }

  function bind(){
    const joy=$("joystick"),knob=joy.querySelector(".joy-knob");
    let joyId=null;
    joy.addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing"))return;
      e.preventDefault();
      joyId=e.pointerId;
      if(settings.joystickMode==="floating"){
        const p=screenToGamePoint(e.clientX,e.clientY),size=joy.offsetWidth;
        joy.style.left=clamp(p.x-size/2,0,root.clientWidth-size)+"px";
        joy.style.top=clamp(p.y-size/2,0,root.clientHeight-size)+"px";
        joy.style.right="auto";
        joy.style.bottom="auto";
      }
      joy.setPointerCapture(e.pointerId);
      moveJoy(e);
    });
    joy.addEventListener("pointermove",e=>{if(e.pointerId===joyId)moveJoy(e)});
    function moveJoy(e){
      const r=joy.getBoundingClientRect(),center=screenToGamePoint(r.left+r.width/2,r.top+r.height/2),point=screenToGamePoint(e.clientX,e.clientY),dx=point.x-center.x,dy=point.y-center.y,max=joy.clientWidth*.34,l=Math.hypot(dx,dy),k=Math.min(1,max/(l||1));
      state.move={x:dx*k/max,y:dy*k/max};
      knob.style.left=(50+state.move.x*34)+"%";
      knob.style.top=(50+state.move.y*34)+"%";
    }
    function resetJoy(){
      joyId=null;
      state.move={x:0,y:0};
      knob.style.left="50%";
      knob.style.top="50%";
    }
    ["pointerup","pointercancel","lostpointercapture"].forEach(n=>joy.addEventListener(n,resetJoy));

    const look=$("lookZone");
    look.addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing")||!state.running)return;
      const p=screenToGamePoint(e.clientX,e.clientY);
      state.lookPointer={id:e.pointerId,x:p.x,y:p.y};
      look.setPointerCapture(e.pointerId);
    });
    look.addEventListener("pointermove",e=>{
      if(!state.lookPointer||state.lookPointer.id!==e.pointerId)return;
      const p=screenToGamePoint(e.clientX,e.clientY),dx=p.x-state.lookPointer.x,dy=p.y-state.lookPointer.y;
      state.lookPointer.x=p.x;
      state.lookPointer.y=p.y;
      const sensitivity=(state.aiming?settings.adsSensitivity:settings.cameraSensitivity)/55*.003;
      state.yaw-=dx*sensitivity;
      state.pitch=clamp(state.pitch-dy*sensitivity*.7,-.32,.55);
    });
    ["pointerup","pointercancel","lostpointercapture"].forEach(n=>look.addEventListener(n,()=>state.lookPointer=null));

    bindHold("fireButton",()=>{state.fireHeld=true;state.triggerLocked=false},()=>{state.fireHeld=false;state.triggerLocked=false});
    $("weaponPrevButton").addEventListener("pointerdown",e=>{if(root.classList.contains("editing"))return;e.preventDefault();actions.cycleWeapon(-1)});
    $("weaponNextButton").addEventListener("pointerdown",e=>{if(root.classList.contains("editing"))return;e.preventDefault();actions.cycleWeapon(1)});
    $("fireModeButton").addEventListener("pointerdown",e=>{if(root.classList.contains("editing"))return;e.preventDefault();actions.cycleFireMode()});
    $("aimButton").addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing"))return;
      e.preventDefault();
      state.aiming=!state.aiming;
      $("aimButton").classList.toggle("active",state.aiming);
    });
    $("jumpButton").addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing"))return;
      e.preventDefault();
      state.jumpUntil=performance.now()+420;
      actions.sound(300,.06);
    });
    $("crouchButton").addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing"))return;
      e.preventDefault();
      state.crouching=!state.crouching;
      state.prone=false;
      $("crouchButton").classList.toggle("active",state.crouching);
      $("proneButton").classList.remove("active");
    });
    $("proneButton").addEventListener("pointerdown",e=>{
      if(root.classList.contains("editing"))return;
      e.preventDefault();
      state.prone=!state.prone;
      state.crouching=false;
      $("proneButton").classList.toggle("active",state.prone);
      $("crouchButton").classList.remove("active");
    });
    bindHold("sprintButton",()=>state.sprinting=true,()=>state.sprinting=false);
    $("reloadButton").addEventListener("pointerdown",e=>{if(root.classList.contains("editing"))return;e.preventDefault();actions.reload()});
    $("healButton").addEventListener("pointerdown",e=>{if(root.classList.contains("editing"))return;e.preventDefault();actions.heal()});
    $("lootButton").addEventListener("pointerdown",e=>{if(root.classList.contains("editing"))return;e.preventDefault();actions.pickLoot(true)});

    window.addEventListener("keydown",e=>{
      state.keys.add(e.code);
      if(e.code==="Space"){state.jumpUntil=performance.now()+420;e.preventDefault()}
      if(e.code==="KeyR")actions.reload();
      if(e.code==="KeyF")actions.heal();
      if(e.code==="KeyC")state.crouching=!state.crouching;
      if(e.code==="ShiftLeft"||e.code==="ShiftRight")state.sprinting=true;
      if(e.code==="KeyQ")state.aiming=!state.aiming;
      if(e.code==="Escape"&&state.running&&!state.paused)actions.pauseMatch();
    });
    window.addEventListener("keyup",e=>{
      state.keys.delete(e.code);
      if(e.code==="ShiftLeft"||e.code==="ShiftRight")state.sprinting=false;
    });
  }

  return {bind};
}
