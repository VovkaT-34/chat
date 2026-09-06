// ===============================
// Индикатор "печатает..."
// ===============================
let typingSendTimer=null;
let typingStopTimer=null;
let typingLastSentAt=0;
let typingActive=false;

async function subscribeToTyping(){
    if(typingChannel){try{await supabaseClient.removeChannel(typingChannel);}catch(error){}}
    typingChannel=supabaseClient.channel("typing-status").on("broadcast",{event:"typing"},function(payload){
        var data=payload&&payload.payload?payload.payload:{};
        var userId=data.userId,username=data.username,chatId=Number(data.chatId),state=data.state||"typing";
        if(!userId||!username||!chatId||!currentChatId||chatId!==Number(currentChatId))return;
        if(currentUser&&userId===currentUser.id)return;
        if(state==="stopped"){
            delete typingUsers[userId];
            delete typingUsers[userId+"_timer"];
            updateTypingIndicator();
            return;
        }
        typingUsers[userId]={username:username,chatId:chatId};updateTypingIndicator();
        clearTimeout(typingUsers[userId+"_timer"]);
        typingUsers[userId+"_timer"]=setTimeout(function(){delete typingUsers[userId];delete typingUsers[userId+"_timer"];updateTypingIndicator();},2000);
    }).subscribe();
}
function sendTypingStatus(){
    if(!typingChannel||!currentUser||!currentChatId)return;
    var now=Date.now();
    var chatId=Number(currentChatId);
    var send=function(state){
        if(!typingChannel||!currentUser||!currentChatId||Number(currentChatId)!==chatId)return;
        typingChannel.send({type:"broadcast",event:"typing",payload:{userId:currentUser.id,username:currentUsername||"Пользователь",chatId:chatId,state:state}});
        typingLastSentAt=Date.now();
    };
    clearTimeout(typingStopTimer);
    typingStopTimer=setTimeout(function(){
        if(typingActive&&currentChatId&&Number(currentChatId)===chatId){
            typingActive=false;
            send("stopped");
        }
    },1000);
    if(!typingActive){
        typingActive=true;
        clearTimeout(typingSendTimer);
        send("typing");
        return;
    }
    var delay=Math.max(0,500-(now-typingLastSentAt));
    clearTimeout(typingSendTimer);
    if(delay===0)send("typing");
    else typingSendTimer=setTimeout(function(){if(typingActive)send("typing");},delay);
}
function updateTypingIndicator(){var indicator=document.getElementById("typingIndicator");if(!indicator)return;var users=Object.values(typingUsers).filter(function(user){return user&&user.username&&user.chatId===Number(currentChatId);}).map(function(user){return user.username;});if(!users.length){indicator.style.display="none";indicator.textContent="";return;}var text;if(users.length===1)text=users[0]+" печатает...";else if(users.length===2)text=users[0]+" и "+users[1]+" печатают...";else if(users.length===3)text=users[0]+", "+users[1]+" и "+users[2]+" печатают...";else text=users[0]+", "+users[1]+" и ещё "+(users.length-2)+" человек печатают...";indicator.textContent=text;indicator.style.display="block";}
