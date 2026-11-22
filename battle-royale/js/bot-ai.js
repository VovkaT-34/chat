export function createBotAI({v3,rand,state,actions}){
 function lineBlocked(ax,az,bx,bz){const n=Math.max(8,Math.ceil(Math.hypot(bx-ax,bz-az)/2.5));for(let i=1;i<n;i++){const t=i/n;if(actions.collides(ax+(bx-ax)*t,az+(bz-az)*t,.18))return true}return false}
 function hasSight(b,player,dist){if(dist>42)return false;const dx=player.position.x-b.x,dz=player.position.z-b.z,angle=Math.atan2(dx,dz),diff=Math.atan2(Math.sin(angle-b.mesh.rotation.y),Math.cos(angle-b.mesh.rotation.y));if(Math.abs(diff)>.95&&dist>8)return false;return !lineBlocked(b.x,b.z,player.position.x,player.position.z)}
 function roamTarget(b){b.target=v3(rand(-225,225),0,rand(-225,225));b.wander=rand(5,12);b.idle=rand(.5,3)}
 function updateBots(dt){for(const b of state.bots){if(!b.alive)continue;const player=state.player,dx=player.position.x-b.x,dz=player.position.z-b.z,dist=Math.hypot(dx,dz),seen=hasSight(b,player,dist),noise=state.playerNoise;
  if(noise&&noise.expires>0&&b.noiseSerial!==noise.serial&&Math.hypot(noise.x-b.x,noise.z-b.z)<noise.range){b.noiseSerial=noise.serial;b.mode="investigate";b.target=v3(noise.x,0,noise.z);b.alert=rand(4,7)}
  if(seen){b.alert=7;b.mode="alert";b.target=v3(player.position.x,0,player.position.z)}else b.alert=Math.max(0,b.alert-dt);
  b.shoot-=dt;b.wander-=dt;b.idle=Math.max(0,(b.idle||0)-dt);let speed=0;
  if(b.alert>0&&b.mode==="alert"&&dist<30){const approach=dist>13?1:dist<6?-1:0;speed=approach*2.1;if(dist>1)b.mesh.rotation.y=Math.atan2(dx,dz);if(dist<27&&b.shoot<=0&&!lineBlocked(b.x,b.z,player.position.x,player.position.z)){b.shoot=rand(1.8,3.6);actions.playSfx("botGun");if(Math.random()<(dist<10?.3:.12)){const dmg=rand(4,8),abs=Math.min(state.armor,dmg*.4);state.armor-=abs;state.health=Math.max(0,state.health-(dmg-abs));actions.updateHud();actions.playSfx("damage");if(state.health<=0){actions.finish(false);return}}}}
  else if(b.alert>0){const goal=b.mode==="investigate"&&b.target?b.target:v3(player.position.x,0,player.position.z),to=goal.clone().sub(v3(b.x,0,b.z));if(to.length()>3){to.normalize();speed=b.mode==="investigate"?1.8:1.7;b.mesh.rotation.y=Math.atan2(to.x,to.z)}else if(b.mode==="investigate")b.alert=0}
  else{b.mode="roam";if(!b.target||b.wander<=0||Math.hypot(b.target.x-b.x,b.target.z-b.z)<2)roamTarget(b);if(b.idle===0&&b.target){const dir=b.target.clone().sub(v3(b.x,0,b.z));if(dir.length()>1){dir.normalize();speed=rand(1.2,2);b.mesh.rotation.y=Math.atan2(dir.x,dir.z)}}}
  if(speed){const nx=b.x+Math.sin(b.mesh.rotation.y)*speed*dt,nz=b.z+Math.cos(b.mesh.rotation.y)*speed*dt;if(!actions.collides(nx,b.z,.48))b.x=nx;if(!actions.collides(b.x,nz,.48))b.z=nz}
  if(b.mesh.userData.animate)b.mesh.userData.animate(dt,Math.abs(speed));b.mesh.position.set(b.x,0,b.z)
 }if(state.playerNoise&&state.playerNoise.expires>0)state.playerNoise.expires=Math.max(0,state.playerNoise.expires-dt)}
 return {lineBlocked,updateBots}
}