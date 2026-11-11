import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const turnKeyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID") || "";
const turnApiToken = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN") || "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin)
    }
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

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("approved")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.approved !== true) {
      return json({ error: "Forbidden" }, 403, origin);
    }

    if (!turnKeyId || !turnApiToken) {
      return json({ error: "TURN is not configured" }, 503, origin);
    }

    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${turnApiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ttl: 86400 })
      }
    );

    const data = await response.json();
    if (!response.ok || !Array.isArray(data?.iceServers)) {
      console.error("Cloudflare TURN credential error:", response.status, data);
      return json({ error: "Unable to obtain TURN credentials" }, 502, origin);
    }

    return json({ iceServers: data.iceServers }, 200, origin);
  } catch (error) {
    console.error("get-turn-credentials error:", error);
    return json({ error: "Internal server error" }, 500, origin);
  }
});
