var board2048=[],score2048=0;
function start2048(){board2048=Array(16).fill(0);score2048=0;add2048();add2048();render2048()}
function add2048(){var z=board2048.map(function(v,i){return v?null:i}).filter(function(v){return v!==null});if(!z.length)return;board2048[z[Math.floor(Math.random()*z.length)]]=Math.random()<0.9?2:4}
function render2048(){var g=document.getElementById('grid2048');g.replaceChildren();board2048.forEach(function(v){var t=document.createElement('div');t.className='tile'+(v?' n'+v:'');t.textContent=v||'';g.appendChild(t)});document.getElementById('score2048').textContent=score2048}
function move2048(dir){var changed=false;for(var r=0;r<4;r++){var line=[];for(var k=0;k<4;k++){var i=dir==='left'?r*4+k:dir==='right'?r*4+3-k:dir==='up'?k*4+r:(3-k)*4+r;if(board2048[i])line.push(board2048[i])}var out=[];for(var j=0;j<line.length;j++){if(line[j]===line[j+1]){out.push(line[j]*2);score2048+=line[j]*2;j++}else out.push(line[j])}while(out.length<4)out.push(0);for(var k2=0;k2<4;k2++){var idx=dir==='left'?r*4+k2:dir==='right'?r*4+3-k2:dir==='up'?k2*4+r:(3-k2)*4+r;if(board2048[idx]!==out[k2])changed=true;board2048[idx]=out[k2]}}if(changed){add2048();render2048()}}
var touch2048=null;
document.getElementById('grid2048').addEventListener('touchstart',function(e){var t=e.touches[0];touch2048={x:t.clientX,y:t.clientY}},{passive:true});
document.getElementById('grid2048').addEventListener('touchend',function(e){if(!touch2048)return;var t=e.changedTouches[0],dx=t.clientX-touch2048.x,dy=t.clientY-touch2048.y;if(Math.max(Math.abs(dx),Math.abs(dy))>25)move2048(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));touch2048=null},{passive:true});
document.addEventListener('keydown',function(e){if(activeGame!=='2048')return;var m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.code];if(m){e.preventDefault();move2048(m)}});
start2048();
