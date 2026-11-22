export function createZoneSystem({$,state,actions}){
  function updateZone(dt){
    const bots=state.bots,player=state.player,zoneRing=state.zoneRing;
    state.elapsed+=dt;
    state.zoneTimer-=dt;
    if(state.zoneTimer<=0&&state.zoneStage<4){
      state.zoneStage++;
      state.zoneRadius=[150,105,65,35][state.zoneStage-1];
      state.zoneTimer=state.zoneStage===4?999:75;
      actions.showToast("Безопасная зона сужается");
      actions.playSfx("zone");
    }
    zoneRing.scale.set(state.zoneRadius/200,state.zoneRadius/200,1);
    zoneRing.position.set(0,.22,0);
    const distance=Math.hypot(player.position.x,player.position.z);
    if(distance>state.zoneRadius){
      state.health=Math.max(0,state.health-dt*(state.zoneStage>=3?9:5));
      actions.updateHud();
      $("zoneWarning").textContent="ВНЕ БЕЗОПАСНОЙ ЗОНЫ";
      if(state.health<=0)actions.finish(false);
    }else $("zoneWarning").textContent="";
    for(const b of bots){
      if(b.alive&&Math.hypot(b.x,b.z)>state.zoneRadius+4){
        b.health-=dt*7;
        if(b.health<=0){b.alive=false;actions.sceneRemove(b.mesh)}
      }
    }
    const alive=bots.filter(b=>b.alive).length+1;
    $("aliveCount").textContent=alive;
    $("zoneClock").textContent=actions.fmt(state.zoneTimer);
  }
  function checkWin(){if(state.bots.every(b=>!b.alive))actions.finish(true)}
  return {updateZone,checkWin};
}
