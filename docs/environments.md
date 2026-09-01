# Environment and data operations

## Isolation contract and naming

The only supported targets are `development`, `staging`, and `production`. Every
Wrangler command must include `--env`; the binding-free base configurations are
a deliberate safety rail. A Worker name is `toneyarthi-<service>-<dev|stg|prod>`.
Shared pipeline resources use `toneyarthi-<resource>-<dev|stg|prod>`:

| Resource     | Development                      | Staging                | Production              |
| ------------ | -------------------------------- | ---------------------- | ----------------------- |
| D1           | `toneyarthi-dev`                 | `toneyarthi-stg`       | `toneyarthi-prod`       |
| R2           | `toneyarthi-media-dev`           | `toneyarthi-media-stg` | `toneyarthi-media-prod` |
| ingest Queue | `toneyarthi-news-processing-dev` | `...-stg`              | `...-prod`              |
| audio Queue  | `toneyarthi-tts-processing-dev`  | `...-stg`              | `...-prod`              |

Workers in one target intentionally share that target's D1/R2/Queues because
they form one pipeline; resources are never shared _between_ targets. DLQs append
`-dlq-<target>`. Replace the documented placeholder D1 UUIDs after creating the
three databases. R2 custom domains and API routes follow `*-dev`, `*-staging`,
and the unsuffixed production domain. Non-HTTP Workers explicitly have no route.

## Local D1 workflow

Local development uses Miniflare's local D1 state, not a remote database:

```sh
cp workers/api/.dev.vars.example workers/api/.dev.vars
pnpm exec wrangler d1 migrations apply toneyarthi-dev --local --env development --config workers/api/wrangler.toml
pnpm exec wrangler d1 execute toneyarthi-dev --local --env development --config workers/api/wrangler.toml --file database/seeds/0001_categories.sql
pnpm --filter @toneyarthi/api dev
```

Use the same `--local --env development --config ...` flags for inspection or
ad-hoc SQL. Apply migrations in numeric/lexicographic order; Wrangler records
applied files. Migrations are append-only after reaching any shared target.
Seeds are explicit, repeatable development/reference inputs and never run as
part of deployment.

## Provisioning and secrets

Create D1, R2, both primary Queues and both DLQs for development, then staging,
then production. Insert the returned D1 IDs in every Worker config; bindings for
a given target must use the same ID. Create routes/custom domains only after the
Workers and DNS zone exist.

Copy each `.dev.vars.example` to `.dev.vars` for local work. For remote targets,
run the following from the corresponding Worker directory and enter a unique
value for that target:

```sh
pnpm exec wrangler secret put ADMIN_API_TOKEN --env staging       # api
pnpm exec wrangler secret put INGEST_TRIGGER_SECRET --env staging # ingest
pnpm exec wrangler secret put GEMINI_API_KEY --env staging         # ai + audio, separately
pnpm exec wrangler secret put TTS_FORCE_REGENERATION_TOKEN --env staging # audio
```

Repeat with `--env production`; never copy values between targets. `ADMIN_API_TOKEN`
must match the server-only value in the matching admin deployment. List secret
names with `wrangler secret list --env <target>` (values cannot be read back).
Variables in Wrangler are non-secret; deploy `RELEASE` as the immutable git SHA
with CI/config tooling rather than putting credentials in `[vars]`.

## Staging deployment and migrations

1. Run lint, type-check, tests, Worker dry-runs, and the Expo config/export checks.
2. Back up staging if the migration is destructive. Apply D1 migrations **before**
   Workers when changes are backward-compatible:
   `pnpm exec wrangler d1 migrations apply toneyarthi-stg --remote --env staging --config workers/api/wrangler.toml`.
3. Deploy all five Workers with `wrangler deploy --env staging` (or dispatch the
   staging workflow). Deploy producers before consumers when introducing a new
   message version; deploy consumers first when they accept both old and new.
4. Build the mobile `staging` EAS profile and deploy admin using
   `.env.staging.example` as its contract. Smoke-test health, ingestion, queues,
   DLQs, media, admin authentication, briefings, and mobile reads.

## Production promotion

Promote the exact tested commit—never rebuild from a different branch. Review
the D1 migration list and backup/rollback plan, receive protected-environment
approval, then apply production migrations first when backward-compatible:

```sh
pnpm exec wrangler d1 migrations apply toneyarthi-prod --remote --env production --config workers/api/wrangler.toml
```

Deploy every Worker explicitly with `--env production`, verify Queue/DLQ depth
and API/admin smoke tests, then build/submit the Expo `production` profile and
release the production admin configuration. For a breaking schema change use
expand/migrate/contract across separate releases; never deploy code that needs
a column before the expand migration exists.

## Reset and recovery rules

Local D1/R2 state may be deleted and recreated at any time; reapply all migrations
then approved seeds. Development cloud resources may be reset after announcing
the outage. Staging resets require an owner, a backup decision, Queue/DLQ drain,
and post-reset migrations plus smoke tests. **Production is never reset, seeded,
or bulk-deleted.** Production correction requires an append-only migration or an
audited recovery/import plan with backup and explicit approval. Never copy
production data into a lower target unless it has been formally anonymized.
Deleting D1 does not clear R2 or Queues: reset each approved resource explicitly,
and pause producers before clearing consumers or data.
