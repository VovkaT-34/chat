// =========================================
// СУПЕРАДМИНИСТРАТОР: ВСЕ ГРУППЫ И УЧАСТНИКИ
// =========================================
(function () {
    "use strict";

    var menuHooked = false;
    var refreshBusy = false;
    var messagesHooked = false;
    var chatsHooked = false;
    var usersHooked = false;

    function isSA() {
        var u = window.currentUser;
        if (!u || !u.id || !window.supabaseClient) return Promise.resolve(false);
        return window.supabaseClient.rpc("get_my_access_status").then(function (r) {
            var profile = r && Array.isArray(r.data) ? r.data[0] : null;
            return !r.error && profile && profile.approved === true && profile.role === "superadmin";
        });
    }

    function getItem(id) {
        return document.querySelector('.chat-item[data-chat-id="' + Number(id) + '"]');
    }

    function isExternalGroup(chatId) {
        var item = getItem(chatId);
        return !!(item && item.dataset.chatType === "group" && item.dataset.superadminGroup === "true");
    }

    function getMembers(chatId) {
        return window.supabaseClient.rpc("get_chat_members", { p_chat_id: chatId }).then(function (r) {
            if (r.error) throw r.error;
            return r.data || [];
        });
    }

    function mapSuperadminMessage(m) {
        return { id:m.id,user_id:m.user_id,text:m.text,created_at:m.created_at,reply_to:m.reply_to,chat_id:Number(window.currentChatId),profiles:{username:m.username||"Пользователь"},reply_message:m.reply_to?{text:m.reply_text||"",profiles:{username:m.reply_username||"Пользователь"}}:null };
    }

    async function loadSuperadminMessages() {
        var chatId=Number(window.currentChatId);
        if(!chatId||!isExternalGroup(chatId)||!window.currentUser)return false;
        var r=await window.supabaseClient.rpc("get_group_messages_for_superadmin",{p_chat_id:chatId,p_before_id:null,p_limit:10});
        if(r.error){console.error("Не удалось загрузить сообщения группы:",r.error);return true;}
        var data=(r.data||[]).map(mapSuperadminMessage).reverse(),box=document.getElementById("messages");
        if(!box)return true;
        box.innerHTML="";data.forEach(function(m){var div=renderMessage(m);if(div)box.appendChild(div);});
        window.__saGroupOlderDone=data.length<10;window.__saGroupOlderChatId=chatId;window.__saGroupOldestId=data.length?Number(data[0].id):0;
        if(typeof scrollMessagesToBottom==="function")scrollMessagesToBottom();else box.scrollTop=box.scrollHeight;
        if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();
        return true;
    }

    async function loadSuperadminOlderMessages() {
        var chatId=Number(window.currentChatId);if(!chatId||!isExternalGroup(chatId)||window.__saGroupOlderLoading||window.__saGroupOlderDone)return;
        var box=document.getElementById("messages"),first=box&&box.querySelector("[data-message-id]"),beforeId=first?Number(first.getAttribute("data-message-id")):Number(window.__saGroupOldestId||0);if(!beforeId)return;
        window.__saGroupOlderLoading=true;var beforeHeight=box.scrollHeight;
        var r=await window.supabaseClient.rpc("get_group_messages_for_superadmin",{p_chat_id:chatId,p_before_id:beforeId,p_limit:10});window.__saGroupOlderLoading=false;
        if(r.error){console.error("Не удалось загрузить старые сообщения группы:",r.error);return;}
        var older=(r.data||[]).map(mapSuperadminMessage).reverse();if(older.length<10)window.__saGroupOlderDone=true;
        var fragment=document.createDocumentFragment();older.forEach(function(m){if(box.querySelector('[data-message-id="'+m.id+'"]'))return;var div=renderMessage(m);if(div)fragment.appendChild(div);});box.insertBefore(fragment,box.firstChild);box.scrollTop+=box.scrollHeight-beforeHeight;
    }

    function hookMessageAccess(){
        if(messagesHooked||typeof window.loadMessages!=="function")return;
        var originalLoadMessages=window.loadMessages,originalLoadOlder=window.loadOlderMessages,originalAppend=window.appendMessage;
        window.loadMessages=async function(){if(await isSA()&&isExternalGroup(Number(window.currentChatId)))return loadSuperadminMessages();return originalLoadMessages.apply(this,arguments);};
        if(typeof originalLoadOlder==="function")window.loadOlderMessages=async function(){if(isExternalGroup(Number(window.currentChatId)))return loadSuperadminOlderMessages();return originalLoadOlder.apply(this,arguments);};
        if(typeof originalAppend==="function")window.appendMessage=async function(message){
            if(message&&isExternalGroup(Number(window.currentChatId))&&Number(message.chat_id)===Number(window.currentChatId)){
                var r=await window.supabaseClient.rpc("get_group_messages_for_superadmin",{p_chat_id:Number(window.currentChatId),p_before_id:null,p_limit:100});if(r.error)return;
                var found=(r.data||[]).find(function(m){return Number(m.id)===Number(message.id)});if(!found)return;var box=document.getElementById("messages");if(!box||box.querySelector('[data-message-id="'+found.id+'"]'))return;
                var wasNearBottom=typeof isMessagesBoxNearBottom==="function"?isMessagesBoxNearBottom():true,div=renderMessage(mapSuperadminMessage(found));if(!div)return;box.appendChild(div);if(wasNearBottom)box.scrollTop=box.scrollHeight;if(typeof updateScrollToBottomButton==="function")updateScrollToBottomButton();return;
            }return originalAppend.apply(this,arguments);
        };messagesHooked=true;
    }

    function addExternalGroup(c){
        var list=document.getElementById("chatList");if(!list||getItem(c.chat_id))return;var name=String(c.chat_name||"Групповой чат"),div=document.createElement("div");
        div.className="chat-item group-chat superadmin-unjoined-group";div.dataset.chatId=c.chat_id;div.dataset.chatType="group";div.dataset.superadminGroup="true";div.dataset.lastActivity=c.last_message_at||"";
        div.innerHTML='<span class="chat-item-main"><span class="chat-item-icon"><svg class="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M14 19.5a4 4 0 0 1 6.5-2.9"/></svg></span><span class="chat-item-name"></span><span class="chat-message-status" data-chat-status-id="'+c.chat_id+'"></span></span><span class="chat-item-actions"></span>';
        div.querySelector(".chat-item-name").textContent=name;var label=document.createElement("span");label.style.cssText="display:block;margin-top:2px;font-size:12px;opacity:.7";label.textContent="(вы не участник)";div.querySelector(".chat-item-name").appendChild(label);
        var timer=null,longPress=false;div.addEventListener("pointerdown",function(e){if(e.pointerType==="mouse")return;longPress=false;clearTimeout(timer);timer=setTimeout(function(){longPress=true;if(typeof window.showChatActionMenu==="function")window.showChatActionMenu(c.chat_id,div);},500);},{passive:true});div.addEventListener("pointerup",function(){clearTimeout(timer)});div.addEventListener("pointercancel",function(){clearTimeout(timer)});
        div.addEventListener("contextmenu",function(e){e.preventDefault();e.stopPropagation();if(typeof window.showChatActionMenu==="function")window.showChatActionMenu(c.chat_id,div)});
        div.addEventListener("click",async function(){if(longPress){longPress=false;return}if(document.getElementById("chatActionMenu"))return;window.currentChatId=Number(c.chat_id);document.querySelectorAll(".chat-item.active").forEach(function(x){x.classList.remove("active")});div.classList.add("active");var title=document.getElementById("chatTitle");if(title)title.textContent=name;if(typeof window.openMobileChatView==="function")window.openMobileChatView();if(typeof window.loadMessages==="function")await window.loadMessages();if(typeof window.updateUnreadCount==="function")await window.updateUnreadCount(Number(c.chat_id));});
        list.appendChild(div);
    }

    function forceUnjoinedGroupsToEnd(){
        var list=document.getElementById("chatList");if(!list)return;
        var groups=Array.prototype.slice.call(list.querySelectorAll('.chat-item[data-superadmin-group="true"]'));
        groups.forEach(function(x){list.appendChild(x)});
    }

    async function loadAllGroups(){
        if(refreshBusy)return;refreshBusy=true;try{if(!(await isSA()))return;var r=await window.supabaseClient.rpc("get_my_group_chats");if(r.error)throw r.error;(r.data||[]).forEach(function(c){if(!c.is_member)addExternalGroup(c)});forceUnjoinedGroupsToEnd();
        }catch(e){console.error("Не удалось загрузить группы суперадминистратору:",e)}finally{refreshBusy=false}
    }

    function hookLoadChats(){
        if(chatsHooked||typeof window.loadChats!=="function")return;
        var originalLoadChats=window.loadChats;
        window.loadChats=async function(){
            var result=await originalLoadChats.apply(this,arguments);
            await loadAllGroups();
            forceUnjoinedGroupsToEnd();
            return result;
        };
        chatsHooked=true;
    }

    function hookOpenChatUsers(){
        if(usersHooked||typeof window.openChatUsers!=="function")return;
        var originalOpenChatUsers=window.openChatUsers;
        window.openChatUsers=async function(){
            var result=await originalOpenChatUsers.apply(this,arguments);
            refreshControls();
            return result;
        };
        usersHooked=true;
    }

    function hookDeleteMenu(){
        if(menuHooked||typeof window.showChatActionMenu!=="function")return;var original=window.showChatActionMenu;window.showChatActionMenu=async function(chatId,anchor){var sa=await isSA(),item=getItem(chatId);if(!sa||!item||item.dataset.chatType!=="group"){original(chatId,anchor);return}var old=document.getElementById("chatActionMenu");if(old)old.remove();var menu=document.createElement("div");menu.id="chatActionMenu";menu.style.cssText="position:fixed;z-index:99999;min-width:205px;background:#000;border:1px solid #333;border-radius:12px;box-shadow:0 8px 28px rgba(0,.18);padding:6px;font-size:15px;color:#fff";var button=document.createElement("button");button.type="button";button.textContent="Удалить группу";button.style.cssText="display:block;width:100%;border:0;background:none;color:#fff;text-align:left;padding:11px 12px;border-radius:8px;cursor:pointer;font:inherit";
            button.onclick=async function(e){e.stopPropagation();var groupName=item.querySelector(".chat-item-name")?item.querySelector(".chat-item-name").firstChild.textContent:"группу";if(!confirm("Удалить группу «"+groupName+"» полностью?"))return;button.disabled=true;var r=await window.supabaseClient.rpc("delete_group_chat",{p_chat_id:Number(chatId)});if(r.error){alert(r.error.message||"Не удалось удалить группу.");button.disabled=false;return}menu.remove();if(Number(window.currentChatId)===Number(chatId)){window.currentChatId=0;var title=document.getElementById("chatTitle");if(title)title.textContent="Выберите чат"}if(typeof window.loadChats==="function")window.loadChats()};menu.appendChild(button);document.body.appendChild(menu);var rect=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-220))+"px";menu.style.top=Math.max(8,Math.min(rect.bottom+4,window.innerHeight-75))+"px";setTimeout(function(){document.addEventListener("click",function(){if(menu)menu.remove()},{once:true})},0)};menuHooked=true;
    }

    function usersRoot(){return document.getElementById("chatUsersOverlay")}
    function addControl(text,id,handler){var list=document.getElementById("chatUsersList");if(!list||!list.parentElement||document.getElementById(id))return;var b=document.createElement("button");b.id=id;b.type="button";b.textContent=text;b.style.cssText="display:flex;width:100%;margin-top:12px;padding:11px 14px;border:1px solid #5a4636;border-radius:9px;background:#5a4636;color:#fff;text-align:center;align-items:center;justify-content:center;font:inherit;font-weight:600;cursor:pointer;box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent";b.onclick=function(e){e.preventDefault();e.stopPropagation();handler()};list.parentElement.appendChild(b)}

    async function openAdd(chatId){var root=usersRoot();if(!root)return;root.innerHTML="";var box=document.createElement("div");box.style.cssText="width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;overflow:hidden";var title=document.createElement("div");title.textContent="Добавить пользователя";title.style.cssText="padding:16px 18px 10px;font-size:19px;font-weight:700";box.appendChild(title);var input=document.createElement("input");input.placeholder="Введите имя пользователя";input.autocomplete="off";input.style.cssText="margin:0 14px 8px;padding:12px 14px;border:1px solid #ccc;border-radius:10px;font-size:16px;box-sizing:border-box";box.appendChild(input);var results=document.createElement("div");results.style.cssText="overflow-y:auto;padding:0 8px 8px";box.appendChild(results);var status=document.createElement("div");status.textContent="Введите имя пользователя";status.style.cssText="padding:10px;color:#777;text-align:center";box.appendChild(status);var cancel=document.createElement("button");cancel.type="button";cancel.textContent="Отмена";cancel.style.cssText="border:0;background:transparent;padding:10px 14px;text-align:left;font-size:15px;cursor:pointer";cancel.onclick=window.openChatUsers;box.appendChild(cancel);var ms=await getMembers(chatId).catch(function(){return []});var ids=ms.map(function(m){return String(m.user_id)}),timer=null;
        input.oninput=function(){clearTimeout(timer);timer=setTimeout(async function(){var q=input.value.trim();results.innerHTML="";if(!q){status.textContent="Введите имя пользователя";return}status.textContent="Поиск…";var r=await window.supabaseClient.rpc("search_users",{p_search:q});if(r.error){status.textContent="Не удалось выполнить поиск";return}var users=(r.data||[]).filter(function(u){return !ids.includes(String(u.id))&&String(u.id)!==String(window.currentUser.id)});if(!users.length){status.textContent="Пользователь не найден";return}status.textContent="";users.forEach(function(u){var b=document.createElement("button");b.type="button";b.textContent=u.username;b.style.cssText="display:block;width:100%;border:0;background:transparent;text-align:left;padding:11px 10px;border-radius:10px;font-size:16px;cursor:pointer";b.onclick=async function(){b.disabled=true;var x=await window.supabaseClient.rpc("add_chat_member",{p_chat_id:chatId,p_user_id:u.id});if(x.error){alert(x.error.message||"Не удалось добавить пользователя.");b.disabled=false;return}window.openChatUsers()};results.appendChild(b)})},180)};root.appendChild(box);input.focus()}

    async function openRemove(chatId){var root=usersRoot();if(!root)return;root.innerHTML="";var box=document.createElement("div");box.style.cssText="width:min(460px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;background:#fff;color:#222;border-radius:14px;overflow:hidden";var title=document.createElement("div");title.textContent="Удалить пользователя";title.style.cssText="padding:16px 18px 10px;font-size:19px;font-weight:700";box.appendChild(title);var results=document.createElement("div");results.style.cssText="overflow-y:auto;padding:0 8px 8px";box.appendChild(results);var cancel=document.createElement("button");cancel.type="button";cancel.textContent="Отмена";cancel.style.cssText="border:0;background:transparent;padding:10px 14px;text-align:left;font-size:15px;cursor:pointer";cancel.onclick=window.openChatUsers;box.appendChild(cancel);root.appendChild(box);var ms=await getMembers(chatId),me=String(window.currentUser.id);ms.filter(function(m){return String(m.user_id)!==me}).forEach(function(m){var b=document.createElement("button");b.type="button";b.textContent=(m.nickname||m.username)+"  @"+m.username;b.style.cssText="display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px 10px;border-radius:10px;font-size:16px;cursor:pointer";b.onclick=async function(){if(!confirm("Удалить пользователя «"+(m.nickname||m.username)+"» из группы?"))return;var x=await window.supabaseClient.rpc("remove_chat_member",{p_chat_id:chatId,p_user_id:m.user_id});if(x.error){alert(x.error.message||"Не удалось удалить пользователя.");return}window.openChatUsers()};results.appendChild(b)})}

    async function refreshControls(){if(!(await isSA()))return;var item=getItem(window.currentChatId||0);if(!item||item.dataset.chatType!=="group"||!usersRoot())return;addControl("＋ Добавить пользователя","sa-add-user-button",function(){openAdd(Number(window.currentChatId))});addControl("− Удалить пользователя","sa-remove-user-button",function(){openRemove(Number(window.currentChatId))})}

    function start(){
        setTimeout(function(){hookDeleteMenu();hookMessageAccess();hookLoadChats();hookOpenChatUsers();loadAllGroups();refreshControls()},400);
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
