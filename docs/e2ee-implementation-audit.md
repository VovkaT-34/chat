# E2EE audit: Signal Protocol + post-quantum protection

Status: audit and design only. No production chat behavior or Supabase schema changed.

## Confirmed current architecture

- Static HTML/JavaScript PWA; no root `package.json`. Supabase client is initialized in `supabase.js`.
- `public.messages` currently stores message plaintext in `text`; current table includes `id, chat_id, user_id, text, created_at, reply_to`.
- `06-chat-send.js` inserts plaintext and fetches reply previews from `text`.
- `05-chat-messages.js` loads `text` and reply previews; `14-chat-message-render.js` renders message text and message actions.
- `08-chat-realtime.js` receives the database row through Realtime and handles delivery/notification-related paths.
- `push.js` invokes the `send-message-push` Edge Function.
- Supabase `send-message-push` version 19 selects `messages.text` and places that value in both Web Push and FCM notification bodies. This is a confirmed plaintext exposure path and must be changed before any encrypted pilot is enabled.
- `sw.js` displays the push payload's `body` directly. For encrypted messages, push must be generic (for example, “Новое зашифрованное сообщение”) and must not include content, reply previews, or other secrets.
- Existing RLS is enabled on `messages`, `chats`, and `chat_members`. The current `messages` SELECT policy permits members of a chat and public chats to read message rows. RLS does not protect message contents from database operators; E2EE must encrypt before insertion.
- The app includes public, group, and private conversations. Pilot must be restricted to a verified one-to-one private chat. Other chat types remain explicitly unencrypted until separately implemented.

## Protocol/library finding

Signal's official specifications describe PQXDH for post-quantum initial key establishment and post-quantum ratchet options (including SPQR / Triple Ratchet material in the Double Ratchet specification). This is the right protocol family to target, but protocol documentation alone does not establish that a usable browser implementation is available.

The official `signalapp/libsignal` repository exposes Java, Swift, and TypeScript APIs backed by Rust and explicitly says use outside Signal is unsupported. The TypeScript package is not documented as a drop-in browser/PWA library. Do not ship a custom cryptographic implementation or assume the official library's latest PQ ratchet features are exposed in a browser-compatible build without verifying the exact release, APIs, and target environment.

Decision gate: test whether the official implementation can be built and safely maintained for our actual web/PWA runtime. If not, compare audited alternatives against the same requirements and clearly distinguish Signal-inspired protocol compatibility from official Signal interoperability. Do not silently downgrade or claim “Signal Protocol” where the implementation is not wire-compatible.

## Proposed implementation design (not yet applied)

1. Add a versioned encrypted-message envelope, separate from plaintext. Minimum fields: protocol/version identifier, ciphertext, message type, sender device/key identifier, session/prekey metadata needed by the selected protocol, and authenticated associated-data binding to chat ID, sender ID, and message ID where supported.
2. Add device public identity/prekey records only. Private identity keys, one-time private prekeys, session/ratchet state, and decrypted message cache must remain local and protected. Define device reset, key change, and recovery behavior before enabling the pilot.
3. Update sending, loading, realtime, reply previews, search/copy/rendering, and notifications as one coherent feature. Replies must reference encrypted message IDs and must never fetch or display server-side plaintext previews.
4. Update `send-message-push` before rollout: encrypted messages get generic notification text; no plaintext can be selected into notification payloads. Preserve existing call notifications separately.
5. Use a per-chat encryption state/version so only the pilot private chat is labelled encrypted. Reject plaintext sends in a chat marked encrypted; never silently mix encrypted and plaintext messages.
6. Preserve delivery/read receipts as metadata only. Avoid exposing unnecessary content or key material in logs and error responses.
7. Add tests for two devices, refresh/restart, offline/out-of-order messages, replay/duplicate events, invalid ciphertext, changed recipient identity keys, no-prekey condition, key rotation, device loss, and push payload inspection.

## Next safe steps

- Finish protocol/library feasibility review and pin a version/release.
- Inspect the complete chat-type determination and message action paths before touching them.
- Prepare a reviewable PR/branch implementation with a reversible schema migration.
- Test in a separate/private pilot chat; do not deploy to the live site until the cryptographic and push paths pass review.

No production messages have been modified and no E2EE has been enabled.
