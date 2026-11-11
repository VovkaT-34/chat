import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
  });
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

    const body = await req.json();
    const fcmToken = String(body.token || "").trim();
    if (fcmToken.length < 40 || fcmToken.length > 4096) return json({ error: "Invalid FCM token" }, 400, origin);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("approved")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError || profile?.approved !== true) return json({ error: "Approved account required" }, 403, origin);

    // A device token belongs to one signed-in account only. Reassign it on account changes.
    const { error: deleteError } = await admin.from("android_push_tokens").delete().eq("token", fcmToken);
    if (deleteError) return json({ error: deleteError.message }, 500, origin);

    const { error: insertError } = await admin.from("android_push_tokens").insert({
      user_id: authData.user.id,
      token: fcmToken,
      platform: "android",
      updated_at: new Date().toISOString()
    });
    if (insertError) return json({ error: insertError.message }, 500, origin);

    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error("register-android-push-token error:", error);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
