import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
if (!publishable) throw new Error("Publishable key is not configured");

const allowed = ["https://vovkat-34.github.io", "https://chat.brut-chat.workers.dev", "https://brut-chat.vercel.app", "https://brut-chat.netlify.app"];
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": allowed.includes(o || "") ? o as string : allowed[0],
  "Access-Control-Allow-Headers": "authorization,content-type,x-client-info,apikey",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Vary": "Origin"
});
const out = (d: unknown, s: number, o: string | null) => Response.json(d, { status: s, headers: cors(o) });

Deno.serve(async (req) => {
  const o = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors(o) });
  if (req.method !== "POST") return out({ error: "Method not allowed" }, 405, o);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return out({ error: "Missing authorization" }, 401, o);
    const userClient = createClient(url, publishable, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return out({ error: "Unauthorized" }, 401, o);
    const body = await req.json();
    const action = String(body?.action || "");
    const userId = String(body?.userId || "");
    const role = body?.role == null ? null : String(body.role);
    if (!userId) return out({ error: "Invalid userId" }, 400, o);
    const { data, error } = await userClient.rpc("admin_profile_action", {
      p_action: action,
      p_user_id: userId,
      p_role: role
    });
    if (error) return out({ error: error.message }, 403, o);
    return out(data ?? { ok: true }, 200, o);
  } catch (e) {
    return out({ error: e instanceof Error ? e.message : "Internal server error" }, 500, o);
  }
});
