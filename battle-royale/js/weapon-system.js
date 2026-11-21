export function createWeaponSystem({WEAPONS,state,actions}) {
  const getWeapon=()=>WEAPONS.find(w=>w.id===state.activeWeaponId)||WEAPONS[9];

  function selectWeapon(id){
    const w=WEAPONS.find(x=>x.id===id);
    if(!w)return;
    state.activeWeaponId=id;
    state.weapon=w.name;
    state.weaponType=w.type.toLowerCase();
    state.ammo=state.weaponMagazines[id]??w.mag;
    state.weaponMagazines[id]=state.ammo;
    state.fireMode=w.modes.includes(state.fireMode)?state.fireMode:w.modes[0];
    state.reloadUntil=0;
    if(state.player)actions.setPersonWeapon(state.player,id);
    actions.updateHud();
  }

  function cycleWeapon(step){
    const i=WEAPONS.findIndex(w=>w.id===state.activeWeaponId);
    selectWeapon(WEAPONS[(i+step+WEAPONS.length)%WEAPONS.length].id);
    actions.showToast("Оружие: "+state.weapon);
  }

  function cycleFireMode(){
    const modes=getWeapon().modes;
    if(modes.length<2){
      actions.showToast("Для этого оружия режим один");
      return;
    }
    state.fireMode=modes[(modes.indexOf(state.fireMode)+1)%modes.length];
    actions.showToast("Режим: "+state.fireMode);
    actions.updateHud();
  }

  return {getWeapon,selectWeapon,cycleWeapon,cycleFireMode};
}
