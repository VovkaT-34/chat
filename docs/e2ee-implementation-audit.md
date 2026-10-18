# E2EE audit: Signal Protocol + post-quantum protection

Status: audit only; no production chat behavior changed.

## Current architecture findings

- The site is a static HTML/JavaScript application. The main page loads separate scripts directly; there is no root `package.json`.
- Supabase JS client is created in `supabase.js`; project ref is `sxkukrqjtgkxmzuzondm`.
- Message plaintext is currently written to `public.messages.text` by `06-chat-send.js`.
- `05-chat-messages.js` and `14-chat-message-render.js` read/render `text` and reply previews.
- `08-chat-realtime.js` reads incoming message content and can pass it to Android notifications.
- `push.js` invokes the `send-message-push` Edge Function; `sw.js` displays the push payload's body. The push function must be audited before E2EE is enabled.
- The app currently uses numeric chat IDs and existing server-side delivery/read/status logic. Those features should be preserved where they can work with ciphertext.
- The app supports private, group, and public chats. The first rollout must be explicitly limited to one-to-one private chats; other chat types must not be presented as end-to-end encrypted until implemented and tested.

## Security requirements for the pilot

1. Encrypt on the sender's device before any Supabase request.
2. Store only ciphertext and necessary routing/protocol metadata on the server; never upload private identity/session keys.
3. Keep identity keys, prekeys, and ratchet state in device-local persistent storage with a documented recovery/device-change strategy.
4. Do not put message plaintext, reply previews, or other sensitive content in push payloads, logs, analytics, or error messages.
5. Verify recipient identity keys and provide a way for users to compare/verify safety numbers.
6. Fail closed if required post-quantum session establishment is unavailable; never silently downgrade.
7. Preserve current non-E2EE chat behavior until the pilot is deliberately enabled. Clearly label which chat is encrypted and which is not.
8. Test multiple devices, browser refresh/restart, out-of-order delivery, duplicate realtime events, key rotation, recipient key changes, and failure/recovery.

## Library decision gate

Signal's official `signalapp/libsignal` documents Java, Swift, and TypeScript/Node-facing packages and explicitly says external use is unsupported; the repository is not a simple drop-in browser script for this static site. The older browser package `libsignal-protocol` is stale and does not meet the required post-quantum requirement by itself.

A browser-capable third-party implementation claiming PQXDH and post-quantum ratcheting is a candidate for evaluation, but it is **not wire-compatible with Signal Messenger** and is not affiliated with Signal. It must not be described as the official Signal implementation. Before choosing it, review its protocol profile, implementation/security review, license, API stability, browser storage model, and interoperability claims.

Do not implement custom cryptographic primitives or enable E2EE based on a demo alone. Next step is to complete the library/security review and map the exact message schema and push function before writing integration code.
