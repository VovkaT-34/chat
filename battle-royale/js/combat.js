export function createCombatSystem({THREE,v3,state,actions}){
  function reload(){
    const w=actions.getWeapon(),weaponId=state.activeWeaponId;
    if(state.reloadUntil>performance.now()||state.ammo>=w.mag||state.reserveByAmmo[w.ammo]<=0)return;
    const duration=w.reload;
    state.reloadUntil=performance.now()+duration;
    actions.showToast("Перезарядка…");
    actions.playSfx("reload");
    setTimeout(()=>{
      if(state.gameOver||state.activeWeaponId!==weaponId)return;
      const n=Math.min(w.mag-state.ammo,state.reserveByAmmo[w.ammo]);
      state.ammo+=n;
      state.reserveByAmmo[w.ammo]-=n;
      state.weaponMagazines[weaponId]=state.ammo;
      state.reloadUntil=0;
      actions.updateHud();
    },duration);
  }

  function shoot(){
    const w=actions.getWeapon(),now=performance.now();
    if(!state.running||state.paused||state.gameOver||actions.root.classList.contains("editing")||state.reloadUntil>now||now-state.lastShot<w.rate)return;
    if(state.fireMode!=="AUTO"&&state.triggerLocked)return;
    const rounds=state.fireMode==="BURST"?3:1;
    if(state.ammo<rounds){
      actions.showToast("Нет патронов");
      if(state.settings.autoReload&&state.reserveByAmmo[w.ammo]>0)reload();
      return;
    }
    state.triggerLocked=true;
    state.lastShot=now;
    state.ammo-=rounds;
    state.weaponMagazines[state.activeWeaponId]=state.ammo;
    actions.updateHud();
    actions.playSfx("gun");
    const camera=state.camera,raycaster=state.raycaster,bots=state.bots;
    camera.updateMatrixWorld();
    const aimDirection=new THREE.Vector3();
    camera.getWorldDirection(aimDirection);
    if(state.settings.aimAssist){
      let best=null,bestAngle=.065;
      for(const b of bots){
        if(!b.alive)continue;
        const to=v3(b.x,1.25,b.z).sub(camera.position),dist=to.length();
        if(dist>w.range)continue;
        const angle=aimDirection.angleTo(to.normalize());
        if(angle<bestAngle){bestAngle=angle;best=b}
      }
      if(best)aimDirection.copy(v3(best.x,1.25,best.z).sub(camera.position).normalize());
    }
    raycaster.set(camera.position,aimDirection);
    const hits=raycaster.intersectObjects(bots.filter(b=>b.alive).map(b=>b.mesh),true);
    const blocks=raycaster.intersectObjects(state.obstacles.map(o=>o.mesh),true);
    if(blocks.length&&(!hits.length||blocks[0].distance<hits[0].distance)){
      actions.showToast("Попадание в укрытие");
      return;
    }
    if(hits.length){
      actions.playSfx("hit");
      const hitObject=hits[0].object;
      const bot=bots.find(b=>b.alive&&(()=>{
        let node=hitObject;
        while(node){if(node===b.mesh)return true;node=node.parent}
        return false;
      })());
      if(bot&&camera.position.distanceTo(bot.mesh.position)<w.range){
        for(let shot=0;shot<rounds&&bot.health>0;shot++){
          let damage=w.damage;
          if(state.aiming)damage*=1.25;
          const absorbed=Math.min(bot.armor,damage*.45);
          bot.armor-=absorbed;
          bot.health-=damage-absorbed;
          state.totalDamage+=damage;
        }
        if(bot.health<=0){
          bot.alive=false;
          state.scene.remove(bot.mesh);
          state.kills++;
          actions.makeLoot("ammo",bot.x,bot.z);
          if(Math.random()>.55)actions.makeLoot("medkit",bot.x+.7,bot.z);
          actions.showToast("Противник устранён");
        }else actions.showToast("Попадание");
        actions.updateHud();
      }
    }
    if(state.settings.effects){
      const p=new THREE.Mesh(new THREE.SphereGeometry(.07,6,6),new THREE.MeshBasicMaterial({color:"#ffdb85"}));
      p.position.copy(camera.position).add(raycaster.ray.direction.clone().multiplyScalar(1.2));
      state.scene.add(p);
      state.particles.push({mesh:p,life:.12});
    }
  }

  function heal(){
    if(state.medkits<=0||state.health>=95)return;
    state.medkits--;
    state.health=Math.min(100,state.health+45);
    actions.updateHud();
    actions.showToast("Аптечка использована");
    actions.playSfx("heal");
  }

  function pickLoot(force=false){
    for(const item of state.loot){
      if(!item.active||Math.hypot(state.player.position.x-item.x,state.player.position.z-item.z)>2.2)continue;
      if(!state.settings.autoLoot&&!force)continue;
      item.active=false;
      state.scene.remove(item.mesh);
      if(item.type==="ammo")state.reserveByAmmo[actions.getWeapon().ammo]+=24;
      if(item.type==="medkit")state.medkits=Math.min(5,state.medkits+1);
      if(item.type==="armor")state.armor=Math.min(100,state.armor+30);
      if(item.type==="weapon"){
        actions.cycleWeapon(1);
        state.reserveByAmmo[actions.getWeapon().ammo]+=30;
      }
      actions.playSfx("pickup");
      actions.showToast(item.type==="weapon"?"Подобран автомат":item.type==="medkit"?"Подобрана аптечка":item.type==="armor"?"Броня усилена":"Патроны подобраны");
      actions.updateHud();
    }
  }

  return {shoot,reload,heal,pickLoot};
}
