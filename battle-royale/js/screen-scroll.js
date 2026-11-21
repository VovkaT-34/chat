export function bindScreenScroll($,screenToGamePoint){
  ["settings","how"].forEach(id=>{
    const screen=$(id),panel=screen.querySelector(".dialog");let pointerId=null,lastY=0;
    screen.addEventListener("pointerdown",e=>{
      const rect=panel.getBoundingClientRect();
      if(e.clientX>=rect.left&&e.clientX<=rect.right)return;
      if(e.target.closest?.(".settings-scroll-rail"))return;
      pointerId=e.pointerId;lastY=screenToGamePoint(e.clientX,e.clientY).y;
      screen.setPointerCapture(e.pointerId);e.preventDefault();
    },{passive:false});
    screen.addEventListener("pointermove",e=>{
      if(e.pointerId!==pointerId)return;
      e.preventDefault();const y=screenToGamePoint(e.clientX,e.clientY).y;
      panel.scrollTop+=lastY-y;lastY=y;
    },{passive:false});
    const stop=e=>{if(e.pointerId===pointerId)pointerId=null;};
    ["pointerup","pointercancel","lostpointercapture"].forEach(type=>screen.addEventListener(type,stop));
  });
}
