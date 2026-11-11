# Browser Chat — Signal E2EE / post-quantum implementation plan

Status: design and feasibility review only. This document does not enable encryption or change message behavior.

## Current confirmed architecture and exposure

- The application is a static HTML/JavaScript PWA. The repository root has no package.json/build pipeline for bundling a native Node cryptography dependency into the browser.
- Supabase is the message transport and storage layer. The current message model stores readable message content in `public.messages.text`.
- The current `send-message-push` Edge Function is version 20. It reads `messages.text` and places it in both Web Push and FCM notification bodies. This is a confirmed plaintext disclosure path. It must be changed to generic notification text before any encrypted chat is enabled.
- Realtime, reply previews, message rendering, history loading, and message deletion currently operate on the plaintext message field. All of these paths must be migrated together for an encrypted chat.
- The first E2EE pilot remains exactly one private 1:1 chat between two users. Group chats, public chats, and calls must not be labelled encrypted until their separate protocol and device models are implemented and tested.

## Protocol target

Use the Signal specification family rather than a home-grown construction:

1. PQXDH for asynchronous initial session establishment and post-quantum confidentiality of the initial key agreement.
2. The Signal Double Ratchet for per-message keys, forward secrecy, out-of-order delivery, and break-in recovery.
3. For a post-quantum ratchet target, evaluate the Signal specification's Triple Ratchet composition: classical Double Ratchet plus Sparse Post-Quantum Ratchet, with the post-quantum component based on an approved SCKA profile such as ML-KEM Braid.
4. Use the exact wire format, KDF labels, key encoding, bounds, and state-transition rules of the selected library/specification. Do not implement these primitives manually.

Important limitation: the PQXDH specification states that its mutual authentication in the current revision is still based on classical discrete-log assumptions. Post-quantum key establishment must not be described as fully post-quantum identity authentication. Safety-number / QR verification and key-change warnings remain required.

## Library feasibility gate

- Signal's official `signalapp/libsignal` is the first implementation to evaluate. Its README exposes Java, Swift, and TypeScript APIs backed by Rust, but explicitly says use outside Signal is unsupported and APIs can change without notice.
- The published TypeScript NPM package is documented for Node and includes native platform binaries. The upstream documentation does not establish a supported browser/PWA build.
- Therefore, do not add `@signalapp/libsignal-client` directly to the static browser app and assume it works. First prove that a pinned, reproducible browser-compatible build exposes the required PQXDH + Triple Ratchet APIs and passes upstream tests on Android Chrome and iOS Safari.
- Do not use browser Signal ports that explicitly state they are unaudited or not security-reviewed. A fork or WASM build is not automatically safe merely because it implements familiar protocol names.
- If the official implementation cannot be supported in the browser, stop and compare independently audited implementations. Do not silently downgrade from PQXDH / post-quantum ratcheting to X3DH or classical Double Ratchet.

## Data and key architecture — design only

Server-side Supabase may store:
- Public device identity keys and signed public prekeys.
- One-time public prekeys and their identifiers / consumption state.
- Protocol version and public device metadata.
- Encrypted message envelopes and non-content delivery metadata.

Server-side Supabase must never receive:
- Identity private keys.
- Signed-prekey private keys.
- One-time-prekey private keys.
- Ratchet state or message keys.
- Decrypted message text, reply previews, or plaintext notification content.

Private keys and ratchet state remain on each device. Browser persistence requires an explicit IndexedDB design, atomic session-state updates, backup/reset rules, and a clear response to browser storage deletion. Device-local WebCrypto wrapping can protect stored bytes at rest, but it does not protect against malicious same-origin JavaScript or an XSS compromise.

## Message envelope and migration requirements

Before changing `messages`, design a versioned envelope containing at least:
- protocol and envelope version;
- ciphertext and authenticated header;
- sender device identifier;
- recipient/session routing metadata required by the selected implementation;
- message type and bounded metadata;
- associated-data binding to chat, sender, and message identity where supported.

Encrypted chats must reject plaintext sends. Plaintext chats must remain explicitly plaintext. Never infer encryption merely from the presence of a ciphertext field or show a lock icon without a verified active session.

Update these paths as one release:
- send and retry logic;
- message history and pagination;
- Realtime receive/decrypt and state commit;
- replies and reply previews;
- edit/delete behavior;
- notifications and service worker;
- search, copy, export, and error logging;
- device/session reset and key-change verification.

## Push and notification requirement

Before enabling the pilot, update `send-message-push` so encrypted messages send only generic text (for example, “Новое зашифрованное сообщение”). Do not send message text, sender-entered content, reply text, or decrypted previews through Web Push, FCM, logs, or analytics. Keep call notifications separate.

## Pilot acceptance tests

- Two distinct user accounts and two independent devices.
- First contact while recipient is offline; prekey bundle use and one-time-prekey consumption.
- Both directions of messaging and session establishment.
- Reload, browser restart, offline queue, duplicate Realtime events, retry, and out-of-order messages.
- Invalid ciphertext, malformed headers, replay, stale keys, and bounded skipped-key storage.
- Identity-key change warning and manual QR/safety-number verification.
- Device loss, browser storage deletion, key reset, and recovery behavior.
- Inspect database rows, Edge Function logs, Web Push payloads, FCM payloads, and service-worker notifications to confirm no plaintext appears.
- Verify that all non-pilot chats continue to work and are not represented as encrypted.

## Rollout rule

No E2EE production flag, schema migration, library dependency, or encrypted-chat label until the browser library feasibility gate and all pilot tests pass. Enable the feature for only the designated private 1:1 pilot; retain a reversible migration and a plaintext fallback only for chats not marked as encrypted.
