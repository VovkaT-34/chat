// ===============================
// Отрисовка сообщения
// ===============================
const chatReadBoundaryCache = new Map();
const MESSAGE_PIN_STORAGE_KEY = "message-pin-v1:";
const MESSAGE_ACTION_ICON_SVG = { reply:'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15 4 10l5-5"/><path d="M4 10h9a7 7 0 0 1 7 7v2"/></svg>', copy:'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0 2 2h3"/></svg>', pin:'<svg class="message-action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 4 6 0 1 6 3 3-5 1v6l-2-2-2 2v-6l-5-1 3-3 1-6Z"/></svg>' };

function getPinnedMessages(){try{var raw=localStorage.getItem(MESSAGE_PIN_STORAGE_KEY+(currentUser&&currentUser.id?currentUser.id:"guest"));var parsed=raw?JSON.parse(raw):{};return parsed&&typeof parsed==="object"?parsed:{};}catch(error){return {};}}
function savePinnedMessages(map){try{localStorage.setItem(MESSAGE_PIN_STORAGE_KEY+(currentUser&&currentUser.id?currentUser.id:"guest"),JSON.stringify(map));}catch(error){}}
function applyPinnedMessageStyle(message,pinned){if(!message)return;if(pinned)message.classList.add("message-pinned");else message.classList.remove("message-pinned");}
function getPinnedMessageElements(){var box=document.getElementById("messages");if(!box)return [];var pins=getPinnedMessages();return Array.prototype.slice.call(box.querySelectorAll(".message[data-message-id]")).filter(function(message){return !!pins[String(message.dataset.messageId)];}).sort(function(a,b){return (Number(pins[String(b.dataset.messageId)])||0)-(Number(pins[String(a.dataset.messageId)])||0);});}
var pinnedMessagesBarUpdateScheduled=false;
function schedulePinnedMessagesBarUpdate(){if(pinnedMessagesBarUpdateScheduled)return;pinnedMessagesBarUpdateScheduled=true;setTimeout(function(){pinnedMessagesBarUpdateScheduled=false;updatePinnedMessagesBar();},0);}
function scrollToPinnedMessage(message){if(!message)return;var box=document.getElementById("messages");if(!box)return;var top=message.offsetTop-box.offsetTop-12;box.scrollTo({top:Math.max(0,top),behavior:"smooth"});}
function updatePinnedMessagesBar(){
    var box=document.getElementById("messages");
    if(!box)return;
    var pins=getPinnedMessageElements();
    var bar=document.getElementById("pinnedMessagesBar");
    if(!pins.length){
        if(bar)bar.remove();
        return;
    }
    if(!bar){
        bar=document.createElement("button");
        bar.id="pinnedMessagesBar";
        bar.type="button";
        bar.setAttribute("aria-label","Прикреплённое сообщение");
        bar.style.cssText="position:sticky;top:0;z-index:30;display:flex;align-items:center;width:calc(100% - 16px);min-height:52px;margin:4px 8px 12px;padding:8px 12px;border:2px solid rgba(78,128,92,.65);border-radius:14px;background:linear-gradient(135deg,rgba(224,240,218,.94),rgba(244,218,169,.92));color:#294832;text-align:left;cursor:pointer;box-shadow:0 3px 12px rgba(52,86,58,.16),inset 0 0 0 1px rgba(255,255,255,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:inherit;box-sizing:border-box;position:sticky;overflow:hidden;";
        bar.addEventListener("click",function(event){
            event.preventDefault();
            event.stopPropagation();
            var currentPins=getPinnedMessageElements();
            if(!currentPins.length)return;
            var next=(Number(bar.dataset.pinnedIndex)||0)+1;
            if(next>=currentPins.length)next=0;
            bar.dataset.pinnedIndex=String(next);
            updatePinnedMessagesBar();
            scrollToPinnedMessage(currentPins[next]);
        });
    }
    var index=Number(bar.dataset.pinnedIndex)||0;
    if(index>=pins.length)index=0;
    bar.dataset.pinnedIndex=String(index);
    var current=pins[index];
    var text=current.querySelector(".message-text");
    var username=current.querySelector(".message-user");
    var preview=(text&&text.textContent||"").trim().replace(/\s+/g," ");
    if(preview.length>120)preview=preview.slice(0,117)+"...";
    bar.replaceChildren();
    var content=document.createElement("span");
    content.style.cssText="display:block;min-width:0;flex:1;overflow:hidden;";
    var label=document.createElement("span");
    label.textContent="📌 Прикреплено";
    label.style.cssText="display:block;font-size:11px;font-weight:700;color:#4f7b57;margin-bottom:2px;";
    var user=document.createElement("span");
    user.textContent=username?username.textContent:"Сообщение";
    user.style.cssText="display:block;font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    var message=document.createElement("span");
    message.textContent=preview||"Прикреплённое сообщение";
    message.style.cssText="display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    var arrow=document.createElement("span");
    arrow.textContent="›";
    arrow.style.cssText="margin-left:10px;font-size:18px;opacity:.72;";
    content.appendChild(label);
    content.appendChild(user);
    content.appendChild(message);
    bar.appendChild(content);
    bar.appendChild(arrow);
    if(bar.parentElement!==box)box.insertBefore(bar,box.firstChild);
    else if(box.firstChild!==bar)box.insertBefore(bar,box.firstChild);
}
function toggleMessagePin(messageId){var map=getPinnedMessages(),key=String(messageId),pinned=!map[key];if(pinned)map[key]=Date.now();else delete map[key];savePinnedMessages(map);closeMessageActionMenu();var message=document.querySelector('.message[data-message-id="'+Number(messageId)+'"]');if(message)applyPinnedMessageStyle(message,pinned);updatePinnedMessagesBar();}
function closeMessageActionMenu(){var menu=document.getElementById("messageActionMenu");if(menu)menu.remove();}
function showMessageActionMenu(message,anchor){closeMessageActionMenu();var menu=document.createElement("div");menu.id="messageActionMenu";menu.style.cssText="position:fixed;z-index:99999;min-width:190px;background:#000;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:6px;font-size:15px;color:#fff;";function add(text,icon,handler){var b=document.createElement("button");b.type="button";b.innerHTML=icon+'<span>'+text+'</span>';b.style.cssText="display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit;";b.addEventListener("click",function(e){e.stopPropagation();handler();});menu.appendChild(b);}var username=message.profiles&&message.profiles.username?message.profiles.username:"Пользователь",text=message.text||"";add("Ответить",MESSAGE_ACTION_ICON_SVG.reply,function(){closeMessageActionMenu();replyToMessage(message.id,username,text);});add("Копировать",MESSAGE_ACTION_ICON_SVG.copy,async function(){try{await navigator.clipboard.writeText(text);}catch(error){var area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.focus();area.select();try{document.execCommand("copy");}catch(copyError){}area.remove();}closeMessageActionMenu();});var pinned=!!getPinnedMessages()[String(message.id)];add(pinned?"Открепить":"Прикрепить",MESSAGE_ACTION_ICON_SVG.pin,function(){toggleMessagePin(message.id);});document.body.appendChild(menu);var r=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,window.innerWidth-205))+"px";menu.style.top=Math.max(8,Math.min(r.bottom+4,window.innerHeight-180))+"px";setTimeout(function(){document.addEventListener("click",closeMessageActionMenu,{once:true});},0);}

function renderMessage(message){
    if(!message||!currentUser)return null;
    var div=document.createElement("div");div.className="message";div.dataset.messageId=message.id;div.dataset.userId=message.user_id;
    var username=message.profiles&&message.profiles.username?message.profiles.username:"Пользователь",date=new Date(message.created_at),dateText=date.toLocaleDateString("ru-RU"),timeText=date.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    var messageStatus=message.user_id===currentUser.id?'<span class="message-status" data-status-message-id="'+message.id+'" data-message-status="sent" style="margin-left:6px;font-size:13px;font-weight:bold;white-space:nowrap;color:#999999" title="Отправлено">✓</span>':"";
    var reply=message.reply_message?'<div style="background:#eeeeee;padding:8px;border-left:4px solid #8E44AD;border-radius:6px;margin-bottom:8px;font-size:14px;overflow-wrap:anywhere;word-break:break-word">↩ '+(message.reply_message.profiles&&message.reply_message.profiles.username?message.reply_message.profiles.username:"Пользователь")+'<br>'+(message.reply_message.text||"")+'</div>':"";
    div.innerHTML='<div><span class="message-user">'+username+'</span><span class="message-time">'+dateText+' '+timeText+'</span>'+messageStatus+'</div>'+reply+'<div class="message-text">'+(message.text||"")+'</div><button onclick=\'replyToMessage('+message.id+', '+JSON.stringify(username)+', '+JSON.stringify(message.text||"")+')\' style="margin-top:6px;padding:3px 8px;border:none;border-radius:7px;background:#9B7AC2;color:white;cursor:pointer;font-size:12px">↩ Ответить</button>';
    var pinned=!!getPinnedMessages()[String(message.id)];applyPinnedMessageStyle(div,pinned);schedulePinnedMessagesBarUpdate();
    var longPressTimer=null,longPressTriggered=false;function cancelLongPress(){if(longPressTimer!==null){clearTimeout(longPressTimer);longPressTimer=null;}}function startLongPress(event){if(event.pointerType==="mouse")return;longPressTriggered=false;cancelLongPress();longPressTimer=setTimeout(function(){longPressTimer=null;longPressTriggered=true;showMessageActionMenu(message,div);},500);}function finishLongPress(){cancelLongPress();}div.addEventListener("pointerdown",startLongPress,{passive:true});div.addEventListener("pointerup",finishLongPress);div.addEventListener("pointercancel",finishLongPress);div.addEventListener("contextmenu",function(event){event.preventDefault();event.stopPropagation();cancelLongPress();showMessageActionMenu(message,div);});div.addEventListener("click",function(event){if(longPressTriggered){longPressTriggered=false;event.preventDefault();event.stopPropagation();}});
    return div;
}
function getMessageStatusOrder(status){return {sent:1,delivered:2,read:3}[status]||0;}
function setMessageStatus(el,status){if(!el)return;status=String(status||"").toLowerCase();if(!status||status==="none")return;var current=String(el.dataset.messageStatus||"sent").toLowerCase(),currentOrder=getMessageStatusOrder(current),newOrder=getMessageStatusOrder(status);if(!newOrder||newOrder<currentOrder)return;el.dataset.messageStatus=status;if(status==="read"){el.textContent="✓✓";el.title="Прочитано";el.style.setProperty("color","#00C853","important");}else if(status==="delivered"){el.textContent="✓";el.title="Доставлено";el.style.setProperty("color","#00C853","important");}else{el.textContent="✓";el.title="Отправлено";el.style.setProperty("color","#999999","important");}}

async function refreshChatMessageStatuses(chatId,messageIds){
    if(!currentUser||!supabaseClient)return;
    var id=Number(chatId);if(!id)return;
    var ids=(messageIds||[]).map(Number).filter(Boolean);
    if(!ids.length)return;
    try{
        var readsResult=await supabaseClient.from("user_chat_reads").select("last_read_message_id").eq("chat_id",id).neq("user_id",currentUser.id);
        var readBoundary=0;
        if(!readsResult.error){(readsResult.data||[]).forEach(function(row){readBoundary=Math.max(readBoundary,Number(row.last_read_message_id)||0);});chatReadBoundaryCache.set(id,readBoundary);}
        var deliveryResult=await supabaseClient.from("message_deliveries").select("message_id").in("message_id",ids).neq("user_id",currentUser.id);
        var delivered=new Set();
        if(!deliveryResult.error)(deliveryResult.data||[]).forEach(function(row){delivered.add(Number(row.message_id));});
        ids.forEach(function(messageId){
            if(messageId<=readBoundary)cacheAndApplyMessageStatus(messageId,"read");
            else if(delivered.has(messageId))cacheAndApplyMessageStatus(messageId,"delivered");
        });
    }catch(error){console.warn("Ошибка массового обновления статусов:",error);}
}

async function updateMessageStatus(messageId,status){var id=Number(messageId);if(!id||!currentUser||!supabaseClient)return;var el=document.querySelector('[data-status-message-id="'+id+'"]');if(!el)return;if(status===undefined||status===null){var result=await supabaseClient.rpc("get_message_status",{p_message_id:id});if(result.error)return;status=result.data;}setMessageStatus(el,status);}
async function updateChatListMessageStatus(chatId){if(!currentUser||!supabaseClient)return;var id=Number(chatId);if(!id)return;var el=document.querySelector('[data-chat-status-id="'+id+'"]');if(!el)return;var result=await supabaseClient.from("messages").select("id,user_id").eq("chat_id",id).eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(1);if(result.error||!result.data||!result.data.length){el.textContent="";el.title="";delete el.dataset.messageStatus;return;}var last=result.data[0];var statusResult=await supabaseClient.rpc("get_message_status",{p_message_id:last.id});if(statusResult.error)return;el.dataset.messageStatus="sent";setMessageStatus(el,statusResult.data);}
