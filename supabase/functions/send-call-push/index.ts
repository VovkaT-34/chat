import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const allowedOrigins = [
  "https://vovkat-34.github.io",
  "https://chat.brut-chat.workers.dev",
  "https://brut-chat.vercel.app",
  "https://brut-chat.netlify.app"
];

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
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", recipientId);
    if (subscriptionsError) return json({ error: subscriptionsError.message }, 500, origin);

    const callerName = callerProfile?.username || "Входящий звонок";

    let sent = 0;
    let removed = 0;
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
            mode,
            url: `./index.html?chat=${encodeURIComponent(chatId)}&call=${encodeURIComponent(callId)}`
          })
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

    return json({ ok: true, sent, removed }, 200, origin);
  } catch (error) {
    console.error("send-call-push error:", error);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
