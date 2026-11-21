export function createZoneSystem({state,actions}){
  function updateZone(dt){
  const bots=state.bots,player=state.player,zoneRing=state.zoneRing;state.elapsed+=dt;state.zoneTimer-=dt;if(zoneTimer<=0&&state.zoneStage<4){state.zoneStage++;state.zoneRadius=[35,25,17,10][zoneStage-1];state.zoneTimer=state.zoneStage===4?999:75;showToast("Безопасная зона сужается");playSfx("zone")}zoneRing.scale.set(state.zoneRadius/47,state.zoneRadius/47,1);zoneRing.position.set(0,.22,0);const d=Math.hypot(player.position.x,player.position.z);if(d>state.zoneRadius){state.health=Math.max(0,state.health-dt*(state.zoneStage>=3?9:5));updateHud();$("zoneWarning").textContent="ВНЕ БЕЗОПАСНОЙ ЗОНЫ";if(state.health<=0)finish(false)}else $("zoneWarning").textContent="";for(const b of bots){if(b.alive&&Math.hypot(b.x,b.z)>zoneRadius+4){b.health-=dt*7;if(b.health<=0){b.alive=false;scene.remove(b.mesh)}}}const alive=bots.filter(b=>b.alive).length+1;$("aliveCount").textContent=alive;$("zoneClock").textContent=fmt(zoneTimer)}
  
  function checkWin(){if(state.bots.every(b=>!b.alive))actions.finish(true)}

  return {updateZone,checkWin};
}
