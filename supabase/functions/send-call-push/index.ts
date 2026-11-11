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

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const allowedOrigins = [
  "https://vovkat-34.github.io",
  "https://chat.brut-chat.workers.dev",
  "https://brut-chat.vercel.app",
  "https://brut-chat.netlify.app"
];

function b64u(bytes: Uint8Array) { let value=""; for(const byte of bytes)value+=String.fromCharCode(byte); return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function pemToBytes(pem: string) { const base64=pem.replace(/-----BEGIN PRIVATE KEY-----/g,"").replace(/-----END PRIVATE KEY-----/g,"").replace(/\s/g,""); const binary=atob(base64); const bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i); return bytes; }
async function createFcmAccessToken() {
  if(!fcmClientEmail||!fcmPrivateKey)return null;
  const now=Math.floor(Date.now()/1000);
  const header=b64u(new TextEncoder().encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const payload=b64u(new TextEncoder().encode(JSON.stringify({iss:fcmClientEmail,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
  const unsigned=header+"."+payload;
  const key=await crypto.subtle.importKey("pkcs8",pemToBytes(fcmPrivateKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature=b64u(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned))));
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+signature})});
  if(!response.ok){console.error("FCM OAuth error:",await response.text());return null;}
  const data=await response.json(); return data.access_token||null;
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing authorization" }, 401, origin);

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401, origin);
    const callerId = authData.user.id;

    const body = await req.json();
    const chatId = Number(body.chatId);
    const recipientId = String(body.recipientId || "");
    const callId = String(body.callId || "");
    const mode = body.mode === "video" ? "video" : "audio";

    if (!Number.isInteger(chatId) || chatId <= 0 || !recipientId || !callId) return json({ error: "Invalid call data" }, 400, origin);

    const { data: chat } = await admin.from("chats").select("id, type").eq("id", chatId).maybeSingle();
    if (!chat || chat.type === "public") return json({ error: "Calls are only available in private chats" }, 400, origin);

    const { data: members } = await admin.from("chat_members").select("user_id").eq("chat_id", chatId);
    const memberIds = (members || []).map(row => row.user_id).filter(Boolean);
    if (memberIds.length !== 2 || !memberIds.includes(callerId) || !memberIds.includes(recipientId)) {
      return json({ error: "Only one-to-one chats can be called" }, 403, origin);
    }

    const { data: approvedProfiles, error: profileError } = await admin
      .from("profiles")
      .select("id, approved, username")
      .in("id", [callerId, recipientId]);

    if (profileError || !approvedProfiles || approvedProfiles.length !== 2 || approvedProfiles.some(profile => profile.approved !== true)) {
      return json({ error: "Both call participants must be approved" }, 403, origin);
    }

    const callerProfile = approvedProfiles.find(profile => profile.id === callerId);

    const { data: callSignals, error: callSignalsError } = await admin
      .from("call_signals")
      .select("signal_type, created_at, sender_id, recipient_id, chat_id")
      .eq("call_id", callId)
      .in("signal_type", ["offer", "hangup", "reject"])
      .order("created_at", { ascending: true });
    if (callSignalsError) return json({ error: callSignalsError.message }, 500, origin);

    const offerSignal = (callSignals || []).find(signal =>
      signal.signal_type === "offer" &&
      signal.sender_id === callerId &&
      signal.recipient_id === recipientId &&
      Number(signal.chat_id) === chatId
    );
    if (!offerSignal) return json({ error: "Call offer not found" }, 404, origin);

    const offerTime = Date.parse(offerSignal.created_at);
    const callAlreadyEnded = (callSignals || []).some(signal =>
      (signal.signal_type === "hangup" || signal.signal_type === "reject") &&
      Number.isFinite(offerTime) &&
      Date.parse(signal.created_at) >= offerTime
    );
    if (callAlreadyEnded) {
      return json({ ok: true, sent: 0, removed: 0, fcmSent: 0, fcmRemoved: 0, skipped: "call-ended" }, 200, origin);
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", recipientId);
    if (subscriptionsError) return json({ error: subscriptionsError.message }, 500, origin);

    const callerName = callerProfile?.username || "Входящий звонок";
    const callCreatedAt = Date.now();
    const callExpiresAt = callCreatedAt + 45_000;

    let sent = 0;
    let removed = 0;
    let fcmSent = 0;
    let fcmRemoved = 0;
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({
            type: "incoming-call",
            title: mode === "video" ? "Входящий видеозвонок" : "Входящий звонок",
            body: callerName,
            icon: "https://vovkat-34.github.io/chat/favicon.svg",
            badge: "https://vovkat-34.github.io/chat/favicon.svg",
            tag: `call-${callId}`,
            callId,
            chatId,
            callerName,
            createdAt: callCreatedAt,
            expiresAt: callExpiresAt,
            mode,
            url: `./index.html?chat=${encodeURIComponent(chatId)}&call=${encodeURIComponent(callId)}`
          }),
          { TTL: 45, urgency: "high" }
        );
        sent++;
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("web_push_subscriptions").delete().eq("id", subscription.id);
          removed++;
        } else console.error("Call Web Push send error:", error);
      }
    }

    const { data: androidTokens, error: androidTokensError } = await admin.from("android_push_tokens").select("id, token").eq("user_id", recipientId);
    if (androidTokensError) return json({ error: androidTokensError.message }, 500, origin);
    if (androidTokens?.length && fcmClientEmail && fcmPrivateKey) {
      const accessToken = await createFcmAccessToken();
      if (accessToken) {
        for (const row of androidTokens) {
          try {
            const response = await fetch("https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(fcmProjectId) + "/messages:send", {
              method: "POST",
              headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
              body: JSON.stringify({ message: {
                token: row.token,
                data: { type: "incoming_call", title: mode === "video" ? "Входящий видеозвонок" : "Входящий звонок", body: callerName, callerName, callId, chatId: String(chatId), mode },
                android: { priority: "high", ttl: "45s" }
              } })
            });
            if (response.ok) fcmSent++;
            else {
              const errorText = await response.text();
              if (/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(errorText)) {
                await admin.from("android_push_tokens").delete().eq("id", row.id);
                fcmRemoved++;
              } else console.error("FCM call push error:", errorText);
            }
          } catch (error) { console.error("FCM call push exception:", error); }
        }
      }
    }

    return json({ ok: true, sent, removed, fcmSent, fcmRemoved }, 200, origin);
  } catch (error) {
    console.error("send-call-push error:", error);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
