export function createWorldSystem({THREE,worldSize,settings,rand,createWeaponModel,makePerson,state}) {
  const materials={};

  function mat(color,roughness=.9){
    const key=color+":"+roughness;
    if(!materials[key])materials[key]=new THREE.MeshStandardMaterial({color,roughness});
    return materials[key];
  }

  function box(w,h,d,color,x,y,z,group=state.scene){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
    mesh.position.set(x,y,z);
    mesh.castShadow=settings.shadows;
    mesh.receiveShadow=true;
    group.add(mesh);
    return mesh;
  }

  function addObstacle(x,z,w,d,h=3,color="#a99c80"){
    const group=new THREE.Group();
    group.position.set(x,0,z);
    box(w,h,d,color,0,h/2,0,group);
    state.scene.add(group);
    state.obstacles.push({x,z,w,d,h,mesh:group});
    return group;
  }

  function buildWorld(){
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(worldSize,worldSize),mat("#536b49"));
    ground.rotation.x=-Math.PI/2;
    ground.position.y=-.08;
    ground.receiveShadow=true;
    state.scene.add(ground);

    const path=new THREE.Mesh(new THREE.PlaneGeometry(13,worldSize),mat("#77745c"));
    path.rotation.x=-Math.PI/2;
    path.position.set(0,-.055,0);
    path.receiveShadow=true;
    state.scene.add(path);

    const hemi=new THREE.HemisphereLight("#dce8d0","#46513b",2.0);
    state.scene.add(hemi);
    const sunLight=new THREE.DirectionalLight("#fff0d0",2.25);
    sunLight.position.set(-28,48,-22);
    sunLight.castShadow=settings.shadows;
    sunLight.shadow.mapSize.set(1024,1024);
    sunLight.shadow.camera.left=-62;
    sunLight.shadow.camera.right=62;
    sunLight.shadow.camera.top=62;
    sunLight.shadow.camera.bottom=-62;
    state.sunLight=sunLight;
    state.scene.add(sunLight);

    addObstacle(-19,-22,12,8,3.2,"#817c68");
    addObstacle(21,-25,10,9,3.5,"#8b8068");
    addObstacle(-28,13,9,12,3.1,"#777b68");
    addObstacle(24,19,12,8,3.4,"#8a806d");
    addObstacle(-3,31,15,6,2.8,"#777866");
    addObstacle(3,-38,8,7,3.1,"#817965");
    addObstacle(-40,-5,6,12,2.7,"#777b69");
    addObstacle(40,4,7,11,3.2,"#857d68");

    const zoneRing=new THREE.Mesh(
      new THREE.TorusGeometry(47,.22,6,128),
      new THREE.MeshBasicMaterial({color:"#a9d8ee",transparent:true,opacity:.78})
    );
    zoneRing.rotation.x=-Math.PI/2;
    zoneRing.position.y=.24;
    state.zoneRing=zoneRing;
    state.scene.add(zoneRing);
    state.camera.position.set(0,5,1);
    state.camera.lookAt(0,1,-8);
  }

  function makeLoot(type,x,z){
    const colors={ammo:"#d7b95f",medkit:"#d36f61",armor:"#668fa0",weapon:"#b58b50"};
    const group=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,.12,12),mat("#303b32"));
    base.position.y=.12;
    base.castShadow=true;
    group.add(base);
    const crate=new THREE.Mesh(new THREE.BoxGeometry(.48,.36,.42),mat(colors[type]||"#b58b50"));
    crate.position.y=.36;
    crate.castShadow=true;
    crate.receiveShadow=true;
    group.add(crate);
    if(type==="medkit"){
      const crossV=new THREE.Mesh(new THREE.BoxGeometry(.10,.25,.035),mat("#fff0dc"));
      const crossH=new THREE.Mesh(new THREE.BoxGeometry(.25,.10,.035),mat("#fff0dc"));
      crossV.position.set(0,.38,.224);
      crossH.position.set(0,.38,.224);
      group.add(crossV,crossH);
    }else if(type==="weapon"){
      const weaponModel=createWeaponModel("p92");
      weaponModel.scale.setScalar(.38);
      weaponModel.position.set(0,.53,0);
      group.add(weaponModel);
    }else{
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.08,.38,.44),mat("#e9e2c9"));
      stripe.position.y=.36;
      group.add(stripe);
    }
    group.position.set(x,0,z);
    state.scene.add(group);
    state.loot.push({type,x,z,mesh:group,active:true});
    return group;
  }

  function collides(x,z,r=.55){
    for(const obstacle of state.obstacles){
      if(
        x>obstacle.x-obstacle.w/2-r&&x<obstacle.x+obstacle.w/2+r&&
        z>obstacle.z-obstacle.d/2-r&&z<obstacle.z+obstacle.d/2+r
      )return true;
    }
    return Math.abs(x)>53||Math.abs(z)>53;
  }

  function makeBot(i){
    const botWeapon=["scar","m416","akm","m16","mk14","mk12","svd","kar98k","ump45"][i%9];
    const group=makePerson(["#725b4b","#536a52","#6b5865","#526778"][i%4],true,botWeapon);
    let x,z;
    do{
      x=rand(-45,45);
      z=rand(-45,45);
    }while(Math.hypot(x,z)<15||collides(x,z,.8));
    group.position.set(x,0,z);
    state.scene.add(group);
    state.bots.push({
      mesh:group,x,z,health:100,armor:i%3===0?25:0,alive:true,
      shoot:rand(1,4),wander:rand(0,6),target:null
    });
  }

  return {mat,box,addObstacle,buildWorld,makeLoot,makeBot,collides};
}
