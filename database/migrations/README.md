# D1 migrations

The numbered SQL files in this directory are append-only and are applied in
lexicographic order by Wrangler. Do not edit a migration after it has been
applied to a shared database; add a new numbered migration instead.

See the root [`README.md`](../../README.md#cloudflare-d1) for database creation,
migration, and seed commands.
