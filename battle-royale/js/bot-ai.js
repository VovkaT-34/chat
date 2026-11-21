export function createBotAI({THREE,v3,rand,state,actions}){
  function lineBlocked(ax,az,bx,bz){for(let i=1;i<9;i++){const t=i/9,x=ax+(bx-ax)*t,z=az+(bz-az)*t;if(collides(x,z,.12))return true}return false}

  function updateBots(dt){for(const b of bots){if(!b.alive)continue;const dx=player.position.x-b.x,dz=player.position.z-b.z,dist=Math.hypot(dx,dz);b.shoot-=dt;b.wander-=dt;if(dist<34){const speed=dist>11?2.3:dist<7?-1.1:0;const nx=b.x+dx/(dist||1)*speed*dt,nz=b.z+dz/(dist||1)*speed*dt;if(!collides(nx,b.z,.45))b.x=nx;if(!collides(b.x,nz,.45))b.z=nz;if(dist>2)b.mesh.rotation.y=Math.atan2(dx,dz);if(dist<30&&b.shoot<=0&&!lineBlocked(b.x,b.z,player.position.x,player.position.z)){b.shoot=rand(1.1,2.5);playSfx("botGun");const chance=dist<12?.48:.23;if(Math.random()<chance){let dmg=rand(5,11);const a=Math.min(armor,dmg*.55);armor-=a;health=Math.max(0,health-(dmg-a));updateHud();playSfx("damage");if(health<=0){finish(false);return}}}}else if(b.wander<=0){b.wander=rand(2,5);b.target=v3(rand(-45,45),0,rand(-45,45))}else if(b.target){const d=b.target.clone().sub(v3(b.x,0,b.z));if(d.length()>1){d.normalize().multiplyScalar(dt*1.2);b.x+=d.x;b.z+=d.z;b.mesh.rotation.y=Math.atan2(d.x,d.z)}}b.mesh.position.set(b.x,0,b.z)}}

  return {lineBlocked,updateBots};
}
