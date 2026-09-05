const CACHE_NAME="chat-pwa-v9";
const APP_SHELL=["./","./index.html","./chat.css","./chat-mobile.css","./manifest.webmanifest","./favicon.svg","./message.mp3"];
const SUPABASE_URL="https://sxkukrqjtgkxmzuzondm.supabase.co";
const CONFIRM_DELIVERY_URL=SUPABASE_URL+"/functions/v1/confirm-push-delivery";

self.addEventListener("install",function(event){event.waitUntil(caches.open(CACHE_NAME).then(function(cache){return cache.addAll(APP_SHELL);}).catch(function(){return undefined;}));self.skipWaiting();});
self.addEventListener("activate",function(event){event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf("chat-pwa-")===0&&key!==CACHE_NAME;}).map(function(key){return caches.delete(key);}));}));self.clients.claim();});
self.addEventListener("fetch",function(event){if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(function(response){if(response&&response.ok){var copy=response.clone();caches.open(CACHE_NAME).then(function(cache){return cache.put(event.request,copy);}).catch(function(){});}return response;}).catch(function(){return caches.match(event.request);}));});

async function confirmPushDelivery(data){
    if(!data||!data.messageId||!data.deliveryToken||!data.userId||!data.exp)return;
    try{await fetch(CONFIRM_DELIVERY_URL,{method:"POST",headers:{"Content-Type":"application/json","x-delivery-token":data.deliveryToken},body:JSON.stringify({messageId:data.messageId,userId:data.userId,exp:data.exp})});}
    catch(error){console.warn("Не удалось подтвердить доставку push:",error);}
}

self.addEventListener("push",function(event){
    var data={};
    try{data=event.data?event.data.json():{};}catch(error){data={type:"message",title:"Чат",body:event.data?event.data.text():"Новое сообщение"};}
    var isCall=data.type==="incoming-call";
    var title=data.title||(isCall?"Входящий звонок":"Чат");
    var count=Number.isFinite(Number(data.count))&&Number(data.count)>0?Number(data.count):1;
    var options={
        body:data.body||(isCall?"Входящий звонок":"Новое сообщение"),
        icon:data.icon||"./favicon.svg",
        badge:data.badge||"./favicon.svg",
        tag:data.tag||(isCall?"call":"chat-message")+"-"+(data.chatId||"general"),
        renotify:true,
        silent:false,
        timestamp:Date.now(),
        data:{url:data.url||"./index.html",chatId:data.chatId||null,messageId:data.messageId||null,callId:data.callId||null,type:data.type||"message",userId:data.userId||null,exp:data.exp||null,deliveryToken:data.deliveryToken||null}
    };
    if(!isCall&&count>1)options.body=(data.body||"Новое сообщение")+"\nНепрочитанных: "+count;
    if(isCall){options.requireInteraction=true;options.vibrate=[300,150,300,150,500];options.actions=[{action:"answer",title:"Ответить"},{action:"reject",title:"Отклонить"}];}
    var work=[self.registration.showNotification(title,options)];
    if(data.type==="message")work.push(confirmPushDelivery(data));
    event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick",function(event){
    var notification=event.notification;
    var data=notification&&notification.data?notification.data:{};
    var action=event.action||"";
    notification.close();

    var targetUrl=data.url||"./index.html";
    if(data.type==="incoming-call"&&data.callId){
        var separator=targetUrl.indexOf("?")!==-1?"&":"?";
        targetUrl+=""+separator+"incomingCall=1&callAction="+encodeURIComponent(action||"open");
    }

    event.waitUntil((async function(){
        var list=await clients.matchAll({type:"window",includeUncontrolled:true});
        for(var i=0;i<list.length;i++){
            var client=list[i];
            if("focus" in client&&"navigate" in client){
                try{await client.navigate(targetUrl);await client.focus();return;}catch(error){}
            }
        }
        if(clients.openWindow)await clients.openWindow(targetUrl);
    })());
});
