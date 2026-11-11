# Security hardening deployment order

Baseline recovery point: `CHAT-SECURITY-BASE-20261111`
Baseline commit: `39e3e820e69245450a2265576ca727df95557bf9`

This plan is intentionally staged so the existing production frontend does not lose access to profile fields before the replacement RPCs are deployed.

## Stage 1 — compatibility foundation

Apply `20261111105022_harden_profile_access.sql`.

This stage:
- Adds `is_approved_user()`, `get_my_access_status()`, and `admin_list_profiles()`.
- Keeps the existing profile SELECT column contract for approved users during rollout.
- Restricts profile self-inserts to `role='user'` and `approved=false`.
- Revokes direct UPDATE on `profiles`; existing profile/admin changes continue through trusted SECURITY DEFINER RPCs.
- Adds restrictive approved-user RLS policies to chat, call, delivery, read-state, push-subscription and nickname tables.
- Requires both users to be approved before creating a private chat.

The old frontend remains compatible during this stage.

## Stage 2 — mutation RPC guards

Apply `20261111105048_harden_mutating_chat_rpcs.sql`.

This stage requires `is_approved_user()` and adds an approved-account check to chat membership, group rename/leave, delivery and read-state mutation RPCs.

## Application rollout

Deploy the working branch `security/hardening-20261111` to every production frontend host and deploy the tracked Edge Function source updates.

Then test, with separate approved user, pending user, admin and superadmin sessions:
- login and registration/profile trigger;
- pending-user denial;
- profile username/public ID editing;
- admin approval/rejection and role changes;
- user search;
- private and group chat creation and membership;
- message send/read/delivery and Realtime;
- Web Push, FCM, call push and TURN credential issuance;
- OSINT access for an approved user with the correct app permission.

Do not proceed to stage 3 until every host is running the new client code and these tests pass.

## Stage 3 — final profile/API lockdown

Apply `20261111105100_lock_profile_access.sql`.

This stage:
- Removes direct browser access to private profile columns (email, approval and role).
- Leaves only `id`, `username`, and `public_id` readable directly by authenticated clients.
- Removes direct profile INSERT/UPDATE from browser roles.
- Removes inherited PUBLIC/anon EXECUTE from all public SECURITY DEFINER functions while preserving authenticated RPC access.

Run the read-only checks in:
- `supabase/tests/verify_profile_hardening.sql`
- `supabase/tests/verify_chat_rpc_approval_guards.sql`

Then rerun Supabase Security Advisor. The expected result is no anon-executable SECURITY DEFINER functions. The 2 RLS-enabled tables with no policies remain default-deny and are accessed through restricted RPCs.

## Rollback order

Rollback must be performed in reverse migration order:
1. `supabase/rollback/20261111105100_lock_profile_access.sql`
2. `supabase/rollback/20261111105048_harden_mutating_chat_rpcs.sql`
3. `supabase/rollback/CHAT-SECURITY-BASE-20261111_profiles.sql`

For source rollback, use the backup branch `backup/security-before-20261111` at the baseline commit above.

## E2EE boundary

No encryption schema or client cryptography is enabled by these security migrations. The current push implementation still places plaintext message text in notification payloads. The Signal E2EE pilot must not be enabled until push payloads are generic and the browser-compatible, reviewed Signal implementation passes the feasibility and acceptance tests in `docs/e2ee-signal-pilot-plan.md`.
