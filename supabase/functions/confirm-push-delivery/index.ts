import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const hmacSecret = Deno.env.get("VAPID_PRIVATE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const corsHeaders = { "Access-Control-Allow-Origin": "https://vovkat-34.github.io", "Access-Control-Allow-Headers": "content-type,x-delivery-token", "Access-Control-Allow-Methods": "POST,OPTIONS" };

function b64u(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}
async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(hmacSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = req.headers.get("x-delivery-token") || "";
    const body = await req.json();
    const messageId = Number(body?.messageId);
    const userId = String(body?.userId || "");
    const exp = Number(body?.exp);
    if (!Number.isInteger(messageId) || !userId || !Number.isInteger(exp) || exp < Date.now()) return json({ error: "Invalid delivery token" }, 400);

    const expected = await sign(`${messageId}.${userId}.${exp}`);
    if (expected !== token) return json({ error: "Invalid delivery signature" }, 401);

    const { data: message } = await admin.from("messages").select("id,chat_id,user_id").eq("id", messageId).maybeSingle();
    if (!message || message.user_id === userId) return json({ error: "Invalid message" }, 403);

    const { data: member } = await admin.from("chat_members").select("user_id").eq("chat_id", message.chat_id).eq("user_id", userId).maybeSingle();
    if (!member) return json({ error: "Not a chat member" }, 403);

    const { data: profile, error: profileError } = await admin.from("profiles").select("approved").eq("id", userId).maybeSingle();
    if (profileError || !profile || profile.approved !== true) return json({ error: "Recipient is not approved" }, 403);

    const { error } = await admin.from("message_deliveries").upsert(
      { message_id: messageId, user_id: userId, delivered_at: new Date().toISOString() },
      { onConflict: "message_id,user_id" }
    );
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (error) {
    console.error("confirm-push-delivery:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
