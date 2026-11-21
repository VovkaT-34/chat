export function createGameLoop({state,actions}) {
  function animate(now) {
    requestAnimationFrame(animate);
    if(!state.renderer||!state.scene||!state.camera)return;
    const dt=Math.min(state.clock.getDelta(),.05);
    if(state.running&&!state.paused&&!state.gameOver){
      actions.gyroApply();
      actions.updatePlayer(dt);
      actions.updateBots(dt);
      actions.updateZone(dt);
      actions.pickLoot();
      const nearLoot=state.loot.some(item=>item.active&&Math.hypot(state.player.position.x-item.x,state.player.position.z-item.z)<2.8);
      actions.setLootAvailable(nearLoot&&!state.settings.autoLoot);
      if(state.fireHeld)actions.shoot();
      actions.checkWin();
      for(let i=state.particles.length-1;i>=0;i--){
        state.particles[i].life-=dt;
        if(state.particles[i].life<=0){
          state.scene.remove(state.particles[i].mesh);
          state.particles.splice(i,1);
        }
      }
    }
    actions.drawMiniMap();
    state.renderer.render(state.scene,state.camera);
  }

  return {animate};
}
