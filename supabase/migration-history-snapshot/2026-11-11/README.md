# Supabase migration history snapshot (2026-11-11)

This directory is a read-only recovery archive reconstructed from
`supabase_migrations.schema_migrations` in project `sxkukrqjtgkxmzuzondm`.

- Records captured: 52
- Range: 20260902164500 through 20261111114339
- These files are **not active Supabase CLI migrations**.
- Do not run them against the current database.
- Do not move them into `supabase/migrations/` until the active migration chain has been reconciled.

Why this archive exists:
- The live database reports 52 applied migrations.
- At capture time, the repository's active `supabase/migrations/` directory contained 13 files. It now contains 16: those 13 plus three later migrations whose filenames match their applied database versions.
- A comparison of all 13 active files against the recorded SQL statements found content differences in all 13. Some differences are explainable by the DB journal storing expanded SQL (for example, a dynamic migration is recorded as the resulting CREATE FUNCTION statements), but this means the active chain cannot safely be assumed to be a byte-for-byte source of truth.

The archive preserves the SQL recorded by Supabase for forensic review and disaster recovery planning. It is not a substitute for a database backup or a tested restore.
