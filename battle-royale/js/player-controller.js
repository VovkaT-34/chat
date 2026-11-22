export function createPlayerController({v3,playerSpeed,state,actions}){
  function updatePlayer(dt){
    const player=state.player,camera=state.camera;
    if(!player)return;
    let mx=state.move.x,my=state.move.y;
    if(state.keys.has("KeyW")||state.keys.has("ArrowUp"))my-=1;
    if(state.keys.has("KeyS")||state.keys.has("ArrowDown"))my+=1;
    if(state.keys.has("KeyA")||state.keys.has("ArrowLeft"))mx-=1;
    if(state.keys.has("KeyD")||state.keys.has("ArrowRight"))mx+=1;
    const len=Math.hypot(mx,my);
    if(len>1){mx/=len;my/=len}
    const forward=v3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
    const right=v3(Math.cos(state.yaw),0,-Math.sin(state.yaw));
    const speed=playerSpeed*(state.prone?.2:state.crouching?.48:state.sprinting?1.55:1)*(state.aiming?.78:1);
    const delta=forward.multiplyScalar(-my*speed*dt).add(right.multiplyScalar(mx*speed*dt));
    if(len>.18){
      state.footstepTimer-=dt;
      if(state.footstepTimer<=0){
        actions.playSfx("step");
        state.footstepTimer=state.sprinting?.28:state.crouching?.62:state.prone?.9:.43;
      }
    }else state.footstepTimer=0;
    const nx=player.position.x+delta.x,nz=player.position.z+delta.z;
    if(!actions.collides(nx,player.position.z))player.position.x=nx;
    if(!actions.collides(player.position.x,nz))player.position.z=nz;
    player.rotation.y=state.yaw+Math.PI;
    if(performance.now()<state.jumpUntil)player.position.y=Math.sin((state.jumpUntil-performance.now())/420*Math.PI)*.8;
    else player.position.y=0;
    player.scale.y=state.prone?.52:state.crouching?.78:1;;
    if(player.userData.animate)player.userData.animate(dt,len>0.18?speed:0);
    const target=v3(player.position.x+Math.sin(state.yaw)*9,2.6+state.pitch*7,player.position.z+Math.cos(state.yaw)*9);
    const desired=v3(player.position.x+Math.sin(state.yaw)*8,2.8+state.pitch*7,player.position.z+Math.cos(state.yaw)*8);
    const offset=v3(Math.sin(state.yaw)*7,state.aiming?2.35:3.25,Math.cos(state.yaw)*7);
    camera.position.lerp(v3(player.position.x+offset.x,player.position.y+offset.y,player.position.z+offset.z),1-Math.exp(-dt*8));
    camera.fov=state.aiming?43:64;
    camera.updateProjectionMatrix();
    camera.lookAt(player.position.x-Math.sin(state.yaw)*12,player.position.y+1.45+state.pitch*10,player.position.z-Math.cos(state.yaw)*12);
    void target;
    void desired;
  }
  return {updatePlayer};
}
