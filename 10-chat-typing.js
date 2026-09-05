// ===============================
// Индикатор "печатает..."
// ===============================
async function subscribeToTyping(){
    if(typingChannel){try{await supabaseClient.removeChannel(typingChannel);}catch(error){}}
    typingChannel=supabaseClient.channel("typing-status").on("broadcast",{event:"typing"},function(payload){
        var data=payload&&payload.payload?payload.payload:{};
        var userId=data.userId,username=data.username,chatId=Number(data.chatId);
        if(!userId||!username||!chatId||!currentChatId||chatId!==Number(currentChatId))return;
        if(currentUser&&userId===currentUser.id)return;
        typingUsers[userId]={username:username,chatId:chatId};updateTypingIndicator();
        clearTimeout(typingUsers[userId+"_timer"]);
        typingUsers[userId+"_timer"]=setTimeout(function(){delete typingUsers[userId];delete typingUsers[userId+"_timer"];updateTypingIndicator();},2000);
    }).subscribe();
}
function sendTypingStatus(){if(!typingChannel||!currentUser||!currentChatId)return;typingChannel.send({type:"broadcast",event:"typing",payload:{userId:currentUser.id,username:currentUsername||"Пользователь",chatId:Number(currentChatId)}});}
function updateTypingIndicator(){var indicator=document.getElementById("typingIndicator");if(!indicator)return;var users=Object.values(typingUsers).filter(function(user){return user&&user.username&&user.chatId===Number(currentChatId);}).map(function(user){return user.username;});if(!users.length){indicator.style.display="none";indicator.textContent="";return;}var text;if(users.length===1)text=users[0]+" печатает...";else if(users.length===2)text=users[0]+" и "+users[1]+" печатают...";else if(users.length===3)text=users[0]+", "+users[1]+" и "+users[2]+" печатают...";else text=users[0]+", "+users[1]+" и ещё "+(users.length-2)+" человек печатают...";indicator.textContent=text;indicator.style.display="block";}
