export function createMenuUI({$,root,ui,layoutKey,state,actions}){
  function bind(){
    $("startButton").onclick=startMatch;
    $("quickSettings").onclick=()=>{if(root.classList.contains("editing"))setEditMode(false);
    openScreen("settings")};
    $("settingsButton").onclick=()=>openScreen("settings");
    $("howButton").onclick=()=>openScreen("how");
    $("pauseButton").onclick=pauseMatch;
    $("resumeButton").onclick=resumeMatch;
    $("pauseSettings").onclick=()=>openScreen("settings");
    $("quitButton").onclick=()=>{running=false;
    paused=false;
    gameOver=false;
    openScreen("menu")};
    $("againButton").onclick=startMatch;
    $("resultMenuButton").onclick=()=>openScreen("menu");
    $("mapButton").onclick=()=>{if(root.classList.contains("editing")||!running||paused)return;
    drawMap();
    openScreen("map")};
    $("exitMenuButton").onclick=()=>{if(root.classList.contains("editing"))return;
    running=false;
    paused=false;
    gameOver=false;
    fireHeld=false;
    move={x:0,y:0};
    openScreen("menu")};
    document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{const id=b.dataset.close;
    ui[id].classList.remove("visible");
    if(id==="settings"||id==="how"){if(paused)openScreen("pause");
    else if(!running&&!gameOver)openScreen("menu")}});
    $("hudEdit").onchange=e=>{setEditMode(e.target.checked);
    if(e.target.checked)closeScreens()};
    $("saveLayout").onclick=()=>{saveLayout();
    showToast("Раскладка сохранена")};
    $("resetLayout").onclick=()=>{localStorage.removeItem(layoutKey);
    document.querySelectorAll("[data-hud]").forEach(el=>{el.style.left="";
    el.style.top="";
    el.style.right="";
    el.style.bottom=""});
    showToast("Стандартная раскладка восстановлена")};
    $("pauseButton").addEventListener("click",()=>{if(root.classList.contains("editing"))setEditMode(false)});
  }
  return {bind};
}
