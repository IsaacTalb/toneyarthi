# Tone Yar Thi

Tone Yar Thi is a Burmese-capable news application built as a pnpm monorepo. It
contains an Expo mobile client, a protected Next.js editorial console, five
Cloudflare Workers, shared TypeScript packages, and an append-only D1 schema.
This document is the developer entry point; the linked documents contain the
release and operational detail that should not be duplicated here.

## Architecture and data flow

| Workspace                 | Responsibility                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`             | Expo Router iOS/Android client: public feeds, search, bookmarks, downloads, persistent audio, data-saver policy, analytics, crash reports, and push registration. |
| `apps/admin`              | Server-rendered Next.js editorial and operations console. Browser sessions terminate here; the Worker admin token remains server-only.                            |
| `workers/ingest`          | Scheduled/authenticated RSS ingestion, normalization, deduplication, image persistence, and pipeline queue production.                                            |
| `workers/ai-processor`    | Queue consumer for evidence extraction and Burmese drafting. It records model/prompt versions and stops for human review.                                         |
| `workers/audio-processor` | Queue consumer for verified audio scripts, Gemini TTS, WAV validation, atomic R2 persistence, and bounded retries.                                                |
| `workers/api`             | Public read API, push-token registration, telemetry intake, and token-protected editorial/operations API.                                                         |
| `workers/briefings`       | Scheduled, auditable playlist selection from already-published stories.                                                                                           |
| `packages/*`              | Shared contracts, prompts, source adapters, media safety, AI transport, deduplication, and observability.                                                         |
| `database`                | Ordered D1 migrations plus explicit idempotent reference seeds.                                                                                                   |

The durable path is **source adapter → ingest/D1/R2 → processing Queue → factual
extraction → Burmese draft → editorial review/verification → verified audio
script → TTS Queue → validated R2 audio → explicit editor publication → public
API → mobile cache/download/playback**. Queue consumers claim D1 jobs
idempotently, retry transient failures up to each job's `max_attempts`, and leave
terminal failures visible to the admin retry workflow and DLQs. Publication is
never automatic: the public API only returns published, non-future articles;
editor publication/unpublication changes both the cluster and its member
articles. Source attribution is retained even when a source is later disabled.
See [architecture](docs/architecture.md), [content policy](docs/content-policy.md),
and [media storage](packages/media/README.md).

## Prerequisites

- Node.js 22 or newer and Corepack.
- pnpm **10.28.1** (declared in `package.json`).
- A Cloudflare account with Wrangler access for remote D1, R2, Queues, DLQs,
  routes, and Worker deployments.
- A Gemini API key for AI/TTS workers.
- Expo/EAS access, Android Studio/Xcode as appropriate, and a physical-device
  development build. Expo Go does not validate native background audio or push.
- A supported Next.js host for the admin app with an HTTPS origin in staging and
  production.

## Install and local setup

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
for worker in api ingest ai-processor audio-processor briefings; do
  cp "workers/$worker/.dev.vars.example" "workers/$worker/.dev.vars"
done
cp apps/admin/.env.development.example apps/admin/.env.local
pnpm --filter @toneyarthi/mobile assets:generate
```

Replace every `replace-with-*` value locally. All Worker commands must specify an
environment; package `dev` scripts already select `development`. Configure and
migrate local D1 before starting producers or consumers:

```sh
pnpm exec wrangler d1 migrations apply toneyarthi-dev --local --env development --config workers/api/wrangler.toml
pnpm exec wrangler d1 execute toneyarthi-dev --local --env development --config workers/api/wrangler.toml --file database/seeds/0001_categories.sql
pnpm --filter @toneyarthi/api dev
pnpm --filter @toneyarthi/ingest dev
pnpm --filter @toneyarthi/ai-processor dev
pnpm --filter @toneyarthi/audio-processor dev
pnpm --filter @toneyarthi/briefings dev
pnpm --filter @toneyarthi/admin dev
pnpm mobile:start
```

Wrangler processes are separate terminals. Mobile devices cannot resolve the
host's `localhost`; set `EXPO_PUBLIC_API_BASE_URL` to an accessible development
HTTPS/tunnel or LAN endpoint permitted by the platform before testing on-device.

## Environment and secret contracts

Supported targets are `development`, `staging`, and `production`; their D1, R2,
Queue, DLQ, API, media, admin, and mobile endpoints must never cross targets.
The checked-in URLs are deploy-time public endpoint contracts, not credentials.
Replace the placeholder D1 UUIDs in **every** `workers/*/wrangler.toml` after
provisioning each database.

| Scope                          | Variables / secrets                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile (public at bundle time) | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SITE_URL`, `EXPO_PUBLIC_APP_ENVIRONMENT`; EAS project ID is supplied by Expo config. Never put secrets in `EXPO_PUBLIC_*`. |
| Admin server                   | `APP_ENVIRONMENT`, `ADMIN_API_BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (32+ characters), `ADMIN_API_TOKEN`.                               |
| API Worker secret              | `ADMIN_API_TOKEN` (must match admin); non-secret `ALLOWED_ORIGINS`, `ENVIRONMENT`, `RELEASE`.                                                                       |
| Ingest secret                  | `INGEST_TRIGGER_SECRET`.                                                                                                                                            |
| AI Worker secret               | `GEMINI_API_KEY`; non-secret model selection lives in Wrangler vars.                                                                                                |
| Audio Worker secrets           | `GEMINI_API_KEY`, `TTS_FORCE_REGENERATION_TOKEN`; model, narrator, style, and timeout are vars.                                                                     |
| Briefings                      | No secret currently; `BRIEFING_CONFIG` is a validated Wrangler var.                                                                                                 |

`.env`, `.env.local`, `.dev.vars`, credentials, production data, and generated
build output must remain untracked. Set remote secrets with `wrangler secret put
<NAME> --env <target>` from the relevant Worker directory; use the hosting
platform's encrypted secret store for admin and EAS secrets for build-only
values. Set `RELEASE` to the immutable commit SHA in deployments. The full
resource naming, isolation, reset, and recovery contract is in
[environments](docs/environments.md).

## Database migrations and seeds

Migrations in `database/migrations` are append-only, lexically ordered, and
shared by all Workers. Never modify a migration applied to a shared environment;
add the next numbered file. Seeds are separate and are never applied to
production automatically.

```sh
# Inspect/apply locally
pnpm exec wrangler d1 migrations list toneyarthi-dev --local --env development --config workers/api/wrangler.toml
pnpm exec wrangler d1 migrations apply toneyarthi-dev --local --env development --config workers/api/wrangler.toml

# Apply remotely only after backup/approval
pnpm exec wrangler d1 migrations apply toneyarthi-stg --remote --env staging --config workers/api/wrangler.toml
pnpm exec wrangler d1 migrations apply toneyarthi-prod --remote --env production --config workers/api/wrangler.toml
```

For breaking changes use expand/migrate/contract releases. Apply compatible
schema changes before code that reads them. Pause producers and drain or account
for Queues before destructive recovery. See the [migration policy](database/migrations/README.md).

## Development and validation commands

| Command                                     | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm format` / `pnpm format:check`         | Write/check Prettier formatting.                                       |
| `pnpm lint`                                 | ESLint all tracked application, Worker, package, and script code.      |
| `pnpm typecheck`                            | Type-check every workspace contract.                                   |
| `pnpm test`                                 | Run package, mobile, Worker unit, integration, and failure-path tests. |
| `pnpm workers:dry-run`                      | Bundle all five development Worker configurations without deploying.   |
| `pnpm mobile:config`                        | Resolve the public Expo configuration and plugins.                     |
| `pnpm mobile:export`                        | Produce Android and iOS Expo bundles in `dist/expo`.                   |
| `pnpm --filter @toneyarthi/admin build`     | Production-build the editorial console.                                |
| `python3 scripts/benchmark-list-queries.py` | Check representative D1 list-query plans/performance.                  |

Before review run the complete gate:

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm workers:dry-run && pnpm mobile:config && pnpm mobile:export
pnpm --filter @toneyarthi/admin build
```

Practical acceptance additionally requires local migrations from an empty DB,
API health/public visibility checks, ingest trigger and duplicate ingestion,
Queue retry/terminal-failure inspection, admin login and explicit approval,
unpublish confirmation, R2 audio metadata/playback, download interruption and
offline restart, and physical-device background audio/push registration. Do not
interpret unit tests or an Expo bundle as a physical-device acceptance result.

## Operational workflows

### Editorial publication

1. Inspect generated copy, evidence, attribution, risk flags, and verification.
2. Save edits as revisions; generated records remain immutable.
3. Regenerate only the required article/audio stage and monitor the new job.
4. Publish with explicit approval and a unique idempotency key only from `READY`.
5. Confirm the story and attribution in the public API/mobile app. Unpublish is a
   reversible audited transition that immediately removes article visibility.

### Failures and retries

Consumers increment attempts when claiming a job, return transient failures to
`pending`, and terminalize exhausted AI/TTS work. Use the authenticated
processing page to inspect sanitized diagnostics and create an audited retry;
never edit job states directly. A failed Queue hand-off is marked retryable.
Monitor primary Queue age/depth and DLQs, and correlate logs using job/request
IDs. See [observability](docs/observability.md) and [deployment](docs/deployment.md).

### Mobile persistence and notifications

Bookmarks, completed download metadata/files, player position/rate/queue, data
policy, and notification preferences persist locally. Downloads use a partial
file and atomic promotion; startup removes partial/orphaned state. Previously
downloaded audio and saved snapshots remain available offline, while fresh
feeds/search and non-downloaded media require the API. Push registration is
opt-in, physical-device only, environment scoped, and stores delivery addresses
rather than user profiles. Sending is intentionally conservative and remains an
operational foundation, not a general campaign system. See
[background audio](docs/mobile-background-audio.md), [push](docs/push-notifications.md),
[analytics](docs/mobile-analytics.md), and [accessibility](docs/mobile-accessibility-audit.md).

## Deployment

CI installs the lockfile, runs lint/types/tests, resolves and exports Expo, and
dry-runs all Workers. Promote the exact tested commit through protected staging
and production environments. Provision bindings and secrets first, back up D1,
apply compatible migrations, deploy consumers/producers in message-compatible
order, deploy the API/admin, then build the matching EAS profile. Smoke-test
health, auth, ingest, Queues/DLQs, review/publish/unpublish, public reads, media,
and mobile before promotion. Roll back code only when it remains schema
compatible; data repair requires a new migration or audited recovery plan.

Release checklists: [deployment](docs/deployment.md),
[Android](docs/android-release.md), [iOS](docs/ios-release.md), and
[performance](docs/performance-audit.md).

## Current limitations

- Gemini output is probabilistic and must pass schema/evidence checks plus human
  editorial review; the system is not a source of record.
- TTS is stored as validated mono PCM WAV. It is broadly compatible but larger
  than compressed delivery; monitor the documented size target.
- Native background playback, interruption controls, offline files, APNs/FCM,
  and accessibility require real-device testing; web/Expo Go are insufficient.
- Push token registration/preferences exist, but broad automated notification
  sending and campaign management are intentionally absent.
- Offline support covers saved snapshots and completed audio downloads, not
  offline feed/search synchronization.
- Admin authentication is a single configured credential plus signed session
  and Worker bearer token. Production should additionally enforce the documented
  identity-aware proxy and actor header; this is not multi-role RBAC.

## Documentation index

- [System architecture](docs/architecture.md)
- [Content and attribution policy](docs/content-policy.md)
- [Environment/resource operations](docs/environments.md)
- [Deployment and rollback](docs/deployment.md)
- [Observability](docs/observability.md)
- [Media and audio format audit](packages/media/README.md), [audio audit](docs/audio-format-audit.md)
- [Mobile background audio](docs/mobile-background-audio.md)
- [Push notifications](docs/push-notifications.md)
- [Mobile analytics](docs/mobile-analytics.md)
- [Accessibility audit](docs/mobile-accessibility-audit.md)
- [Performance audit](docs/performance-audit.md)
- [Android release](docs/android-release.md) and [iOS release](docs/ios-release.md)
