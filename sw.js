const CACHE_NAME="chat-pwa-v7";
const APP_SHELL=["./","./index.html","./chat.css","./chat-mobile.css","./manifest.webmanifest","./favicon.svg","./message.mp3"];
const SUPABASE_URL="https://sxkukrqjtgkxmzuzondm.supabase.co";
const CONFIRM_DELIVERY_URL=`${SUPABASE_URL}/functions/v1/confirm-push-delivery`;

self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).catch(()=>undefined));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("chat-pwa-")&&k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(r=>{if(r?.ok){const c=r.clone();caches.open(CACHE_NAME).then(x=>x.put(event.request,c)).catch(()=>undefined);}return r;}).catch(()=>caches.match(event.request)));});

async function confirmPushDelivery(data){
    if(!data?.messageId||!data?.deliveryToken||!data?.userId||!data?.exp)return;
    try{await fetch(CONFIRM_DELIVERY_URL,{method:"POST",headers:{"Content-Type":"application/json","x-delivery-token":data.deliveryToken},body:JSON.stringify({messageId:data.messageId,userId:data.userId,exp:data.exp}),keepalive:true});}
    catch(error){console.warn("Не удалось подтвердить доставку push:",error);}
}

self.addEventListener("push",event=>{
    let data={};
    try{data=event.data?event.data.json():{};}catch{data={type:"message",title:"Чат",body:event.data?event.data.text():"Новое сообщение"};}
    const isCall=data.type==="incoming-call";
    const title=data.title||(isCall?"Входящий звонок":"Чат");
    const count=Number.isFinite(Number(data.count))&&Number(data.count)>0?Number(data.count):1;
    const options={
        body:data.body||(isCall?"Входящий звонок":"Новое сообщение"),icon:data.icon||"./favicon.svg",badge:data.badge||"./favicon.svg",
        tag:data.tag||`${isCall?"call":"chat-message"}-${data.chatId||"general"}`,renotify:true,silent:false,timestamp:Date.now(),
        data:{url:data.url||"./index.html",chatId:data.chatId||null,messageId:data.messageId||null,callId:data.callId||null,type:data.type||"message",userId:data.userId||null,exp:data.exp||null,deliveryToken:data.deliveryToken||null}
    };
    if(!isCall&&count>1)options.body=`${data.body||"Новое сообщение"}\nНепрочитанных: ${count}`;
    if(isCall){options.actions=[{action:"answer",title:"Ответить"},{action:"reject",title:"Отклонить"}];}
    const work=[self.registration.showNotification(title,options)];
    if(data.type==="message")work.push(confirmPushDelivery(data));
    event.waitUntil(Promise.all(work));
});

self.addEventListener("notificationclick",event=>{
    const notification=event.notification;
    const data=notification?.data||{};
    const action=event.action||"";
    notification.close();

    let targetUrl=data.url||"./index.html";
    if(data.type==="incoming-call"&&data.callId){
        const separator=targetUrl.includes("?")?"&":"?";
        targetUrl+=`${separator}incomingCall=1&callAction=${encodeURIComponent(action||"open")}`;
    }

    event.waitUntil((async()=>{
        const list=await clients.matchAll({type:"window",includeUncontrolled:true});
        for(const client of list){
            if("focus"in client&&"navigate"in client){try{await client.navigate(targetUrl);await client.focus();return;}catch{}}
        }
        if(clients.openWindow)await clients.openWindow(targetUrl);
    })());
});
