import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const fcmProjectId = Deno.env.get("FCM_PROJECT_ID") || "chat-d3bed";
const fcmClientEmail = Deno.env.get("FCM_CLIENT_EMAIL") || "";
const fcmPrivateKey = (Deno.env.get("FCM_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
const admin = createClient(supabaseUrl, serviceRoleKey, { auth:{persistSession:false,autoRefreshToken:false} });
webpush.setVapidDetails(vapidSubject,vapidPublicKey,vapidPrivateKey);
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage","Access-Control-Allow-Methods":"POST, OPTIONS"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...corsHeaders}});}
function b64u(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
async function sign(value:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(vapidPrivateKey),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));}
function pemToBytes(pem:string){const base64=pem.replace(/-----BEGIN PRIVATE KEY-----/g,"").replace(/-----END PRIVATE KEY-----/g,"").replace(/\s/g,"");const binary=atob(base64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
async function createFcmAccessToken(){
 if(!fcmClientEmail||!fcmPrivateKey)return null;
 const now=Math.floor(Date.now()/1000);
 const header=b64u(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
 const payload=b64u(new TextEncoder().encode(JSON.stringify({iss:fcmClientEmail,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
 const unsigned=`${header}.${payload}`;
 const key=await crypto.subtle.importKey("pkcs8",pemToBytes(fcmPrivateKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const signature=b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned))));
 const jwt=`${unsigned}.${signature}`;
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})});
 if(!response.ok){console.error("FCM OAuth error:",await response.text());return null;}
 const data=await response.json();
 return data.access_token||null;
}
async function sendFcm(token:string,title:string,body:string,chatId:number,messageId:number){
 const accessToken=await createFcmAccessToken();
 if(!accessToken)return {sent:false,invalid:false};
 const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`,{method:"POST",headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({message:{token,notification:{title,body},data:{chatId:String(chatId),messageId:String(messageId)},android:{priority:"high",notification:{channel_id:"chat_messages_v3",sound:"default",click_action:"FLUTTER_NOTIFICATION_CLICK"}}}})});
 if(response.ok)return {sent:true,invalid:false};
 const text=await response.text();
 const invalid=/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(text);
 if(!invalid)console.error("FCM send error:",text);
 return {sent:false,invalid};
}
Deno.serve(async(req:Request)=>{
 const requestStartedAt=Date.now();let authDurationMs=0,messageLookupDurationMs=0,webPushSendDurationMs=0,webPushSendMaxMs=0,fcmSendDurationMs=0;
 if(req.method==="OPTIONS")return new Response("ok",{status:200,headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const authHeader=req.headers.get("Authorization")||""; const token=authHeader.replace(/^Bearer\s+/i,"").trim();
  if(!token)return json({error:"Missing authorization"},401);
  const {data:authData,error:authError}=await admin.auth.getUser(token); authDurationMs=Date.now()-requestStartedAt;
  if(authError||!authData.user)return json({error:"Unauthorized"},401);
  const {messageId}=await req.json(); const id=Number(messageId);
  if(!Number.isInteger(id)||id<=0)return json({error:"Invalid messageId"},400);
  const messageLookupStartedAt=Date.now(); const {data:message,error:messageError}=await admin.from("messages").select("id,chat_id,user_id,text,created_at").eq("id",id).single(); messageLookupDurationMs=Date.now()-messageLookupStartedAt;
  if(messageError||!message)return json({error:"Message not found"},404);
  if(message.user_id!==authData.user.id)return json({error:"Forbidden"},403);
  const {data:chat,error:chatError}=await admin.from("chats").select("type").eq("id",message.chat_id).maybeSingle();
  if(chatError)return json({error:"Unable to verify chat type"},500);
  if(!chat)return json({error:"Chat not found"},404);
  if(chat.type==="public")return json({ok:true,skipped:"public_chat",sent:0,removed:0,fcmSent:0,fcmRemoved:0});
  const {data:sender}=await admin.from("profiles").select("username,approved").eq("id",message.user_id).maybeSingle();
  if(!sender||sender.approved!==true)return json({error:"Sender is not approved"},403);
  const senderName=sender.username||"Новое сообщение";
  const {data:members,error:membersError}=await admin.from("chat_members").select("user_id").eq("chat_id",message.chat_id).neq("user_id",message.user_id);
  if(membersError)return json({error:membersError.message},500);
  let sent=0,removed=0,fcmSent=0,fcmRemoved=0;
  let fcmAccessTokenPromise: Promise<string|null>|null = null;
  for(const member of members||[]){
   if(!member.user_id)continue;
   const {data:profile}=await admin.from("profiles").select("approved").eq("id",member.user_id).maybeSingle();
   if(!profile||profile.approved!==true)continue;
   const {data:notificationSettings,error:notificationSettingsError}=await admin.from("chat_notification_settings").select("push_enabled").eq("user_id",member.user_id).eq("chat_id",message.chat_id).maybeSingle();
   if(notificationSettingsError){console.error("Unable to verify chat push settings:",notificationSettingsError);continue;}
   if(notificationSettings?.push_enabled===false)continue;
   const {data:readRow}=await admin.from("user_chat_reads").select("last_read_message_id").eq("user_id",member.user_id).eq("chat_id",message.chat_id).maybeSingle();
   let unreadQuery=admin.from("messages").select("id",{count:"exact",head:true}).eq("chat_id",message.chat_id).neq("user_id",member.user_id);
   if(readRow?.last_read_message_id){const {data:lastRead}=await admin.from("messages").select("created_at").eq("id",readRow.last_read_message_id).maybeSingle();if(lastRead?.created_at)unreadQuery=unreadQuery.gt("created_at",lastRead.created_at);}
   const {count}=await unreadQuery; const unreadCount=Math.max(1,count||1);
   const exp=Date.now()+24*60*60*1000;
   const deliveryToken=await sign(`${id}.${member.user_id}.${exp}`);
   const {data:subscriptions,error:subscriptionError}=await admin.from("web_push_subscriptions").select("id,endpoint,p256dh,auth,active_until").eq("user_id",member.user_id);
   if(!subscriptionError){
    const appleSubscriptions=(subscriptions||[]).filter(subscription=>String(subscription.endpoint||"").startsWith("https://web.push.apple.com/"));
    const otherSubscriptions=(subscriptions||[]).filter(subscription=>!String(subscription.endpoint||"").startsWith("https://web.push.apple.com/"));
    async function sendWebPushSubscription(subscription){
     const webPushStartedAt=Date.now();try{
      await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},JSON.stringify({title:senderName,body:message.text||"Новое сообщение",icon:"https://vovkat-34.github.io/chat/favicon.svg",badge:"https://vovkat-34.github.io/chat/favicon.svg",tag:`chat-${message.chat_id}`,chatId:message.chat_id,messageId:message.id,count:unreadCount,userId:member.user_id,exp,deliveryToken,url:`./index.html?chat=${encodeURIComponent(message.chat_id)}`}),{TTL:86400,urgency:"high"}); const webPushElapsed=Date.now()-webPushStartedAt;webPushSendDurationMs+=webPushElapsed;webPushSendMaxMs=Math.max(webPushSendMaxMs,webPushElapsed);
      sent++;
     }catch(error){const webPushElapsed=Date.now()-webPushStartedAt;webPushSendDurationMs+=webPushElapsed;webPushSendMaxMs=Math.max(webPushSendMaxMs,webPushElapsed);const statusCode=Number((error as {statusCode?:number})?.statusCode||0);if(statusCode===404||statusCode===410){await admin.from("web_push_subscriptions").delete().eq("id",subscription.id);removed++;}else console.error("Web Push send error:",error);}
    }
    // Apple Push отправляем до ожидания подтверждения Realtime для других платформ.
    for(const subscription of appleSubscriptions)await sendWebPushSubscription(subscription);
    const activeSubscriptions=otherSubscriptions.filter(subscription=>subscription.active_until&&Date.parse(subscription.active_until)>Date.now());
    let activeMessageDelivered=false;
    if(activeSubscriptions.length){
     await new Promise(resolve=>setTimeout(resolve,1500));
     const {data:activeDelivery,error:activeDeliveryError}=await admin.from("message_deliveries").select("message_id").eq("message_id",id).eq("user_id",member.user_id).maybeSingle();
     if(activeDeliveryError)console.warn("Unable to confirm active Realtime delivery; sending push fallback:",activeDeliveryError);
     activeMessageDelivered=Boolean(activeDelivery);
    }
    for(const subscription of otherSubscriptions){
     if(subscription.active_until&&Date.parse(subscription.active_until)>Date.now()&&activeMessageDelivered)continue;
     await sendWebPushSubscription(subscription);
    }
   }
   const {data:fcmTokens,error:fcmTokenError}=await admin.from("android_push_tokens").select("id,token").eq("user_id",member.user_id);
   if(!fcmTokenError && fcmTokens?.length && fcmClientEmail && fcmPrivateKey){
    if(!fcmAccessTokenPromise)fcmAccessTokenPromise=createFcmAccessToken();
    const fcmAccessToken=await fcmAccessTokenPromise;
    if(fcmAccessToken){
     for(const fcmTokenRow of fcmTokens){
      try{
       const fcmSendStartedAt=Date.now(); const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmProjectId)}/messages:send`,{method:"POST",headers:{Authorization:`Bearer ${fcmAccessToken}`,"Content-Type":"application/json"},body:JSON.stringify({message:{token:fcmTokenRow.token,data:{type:"message",title:senderName,body:message.text||"Новое сообщение",chatId:String(message.chat_id),messageId:String(message.id),userId:member.user_id,exp:String(exp),deliveryToken},android:{priority:"high"}}})}); fcmSendDurationMs+=Date.now()-fcmSendStartedAt;
       if(response.ok){fcmSent++;}else{const errorText=await response.text();if(/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(errorText)){await admin.from("android_push_tokens").delete().eq("id",fcmTokenRow.id);fcmRemoved++;}else console.error("FCM send error:",errorText);}
      }catch(error){console.error("FCM send exception:",error);}
     }
    }
   }
  }
  console.log(JSON.stringify({event:"message_push_timing",totalMs:Date.now()-requestStartedAt,authMs:authDurationMs,messageLookupMs:messageLookupDurationMs,webPushSendTotalMs:webPushSendDurationMs,webPushSendMaxMs,fcmSendTotalMs:fcmSendDurationMs,webPushSent:sent,webPushRemoved:removed,fcmSent,fcmRemoved}));
  return json({ok:true,sent,removed,fcmSent,fcmRemoved});
 }catch(error){console.error("send-message-push error:",error);return json({error:"Internal server error"},500);}
});
