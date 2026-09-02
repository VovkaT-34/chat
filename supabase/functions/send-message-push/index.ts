import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Missing authorization" }, 401);

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const { messageId } = await req.json();
    const id = Number(messageId);
    if (!Number.isInteger(id) || id <= 0) return json({ error: "Invalid messageId" }, 400);

    const { data: message, error: messageError } = await admin
      .from("messages")
      .select("id, chat_id, user_id, text, created_at")
      .eq("id", id)
      .single();

    if (messageError || !message) return json({ error: "Message not found" }, 404);
    if (message.user_id !== authData.user.id) return json({ error: "Forbidden" }, 403);

    const { data: sender } = await admin
      .from("profiles")
      .select("username")
      .eq("id", message.user_id)
      .maybeSingle();

    const senderName = sender?.username || "Новое сообщение";

    const { data: members, error: membersError } = await admin
      .from("chat_members")
      .select("user_id")
      .eq("chat_id", message.chat_id)
      .neq("user_id", message.user_id);

    if (membersError) return json({ error: membersError.message }, 500);

    let sent = 0;
    let removed = 0;

    for (const member of members || []) {
      if (!member.user_id) continue;

      const { data: profile } = await admin
        .from("profiles")
        .select("approved")
        .eq("id", member.user_id)
        .maybeSingle();

      if (profile && profile.approved === false) continue;

      const { data: readRow } = await admin
        .from("user_chat_reads")
        .select("last_read_message_id")
        .eq("user_id", member.user_id)
        .eq("chat_id", message.chat_id)
        .maybeSingle();

      let unreadQuery = admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("chat_id", message.chat_id)
        .neq("user_id", member.user_id);

      if (readRow?.last_read_message_id) {
        const { data: lastRead } = await admin
          .from("messages")
          .select("created_at")
          .eq("id", readRow.last_read_message_id)
          .maybeSingle();

        if (lastRead?.created_at) {
          unreadQuery = unreadQuery.gt("created_at", lastRead.created_at);
        }
      }

      const { count } = await unreadQuery;
      const unreadCount = Math.max(1, count || 1);

      const { data: subscriptions, error: subscriptionError } = await admin
        .from("web_push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", member.user_id);

      if (subscriptionError) continue;

      for (const subscription of subscriptions || []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
              }
            },
            JSON.stringify({
              title: senderName,
              body: message.text || "Новое сообщение",
              icon: "https://vovkat-34.github.io/chat/favicon.svg",
              badge: "https://vovkat-34.github.io/chat/favicon.svg",
              tag: `chat-${message.chat_id}`,
              chatId: message.chat_id,
              messageId: message.id,
              count: unreadCount,
              url: `./index.html?chat=${encodeURIComponent(message.chat_id)}`
            })
          );
          sent++;
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("web_push_subscriptions").delete().eq("id", subscription.id);
            removed++;
          } else {
            console.error("Web Push send error:", error);
          }
        }
      }
    }

    return json({ ok: true, sent, removed });
  } catch (error) {
    console.error("send-message-push error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
