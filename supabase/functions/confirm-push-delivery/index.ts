import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const hmacSecret = Deno.env.get("VAPID_PRIVATE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = [
  "https://vovkat-34.github.io",
  "https://chat.brut-chat.workers.dev",
  "https://brut-chat.vercel.app",
  "https://brut-chat.netlify.app"
];
function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "content-type,x-delivery-token",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin"
  };
}

function b64u(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(hmacSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  try {
    const token = req.headers.get("x-delivery-token") || "";
    const body = await req.json();
    const messageId = Number(body?.messageId);
    const userId = String(body?.userId || "");
    const exp = Number(body?.exp);
    if (!Number.isInteger(messageId) || !userId || !Number.isInteger(exp) || exp < Date.now()) return json({ error: "Invalid delivery token" }, 400, origin);

    const expected = await sign(`${messageId}.${userId}.${exp}`);
    if (expected !== token) return json({ error: "Invalid delivery signature" }, 401, origin);

    const { data: message } = await admin.from("messages").select("id,chat_id,user_id").eq("id", messageId).maybeSingle();
    if (!message || message.user_id === userId) return json({ error: "Invalid message" }, 403, origin);

    const { data: member } = await admin.from("chat_members").select("user_id").eq("chat_id", message.chat_id).eq("user_id", userId).maybeSingle();
    if (!member) return json({ error: "Not a chat member" }, 403, origin);

    const { data: profile, error: profileError } = await admin.from("profiles").select("approved").eq("id", userId).maybeSingle();
    if (profileError || !profile || profile.approved !== true) return json({ error: "Recipient is not approved" }, 403, origin);

    const { data: notificationSettings, error: notificationSettingsError } = await admin.from("chat_notification_settings").select("push_enabled").eq("user_id", userId).eq("chat_id", message.chat_id).maybeSingle();
    if (notificationSettingsError) return json({ error: "Unable to verify notification settings" }, 500, origin);
    if (notificationSettings?.push_enabled === false) return json({ ok: true, skipped: "notifications_disabled" }, 200, origin);

    const { error } = await admin.from("message_deliveries").insert(
      { message_id: messageId, user_id: userId, delivered_at: new Date().toISOString() }
    );
    if (error && error.code !== "23505") return json({ error: error.message }, 500, origin);
    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error("confirm-push-delivery:", error);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
