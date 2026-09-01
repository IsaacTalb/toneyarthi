# CI, credentials, and deployments

## GitHub environments and controls

Create `preview`, `staging`, and `production` environments in **Settings → Environments**. Restrict production to the `main` branch and configure at least one required reviewer; this reviewer gate is the mandatory production approval. Do not grant self-approval. Preview and staging may use separate reviewer/branch rules. The deployment workflow automatically deploys `main` to staging and exposes all three targets through manual dispatch. Its concurrency group serializes deployments to each target, and each Worker is an independent job so a failure cannot silently skip another service.

Cloudflare Worker configuration must define `[env.preview]` and `[env.staging]` resources in every `workers/*/wrangler.toml` before those targets are enabled. Give them distinct Worker names and distinct D1, R2, and Queue resources. Production uses the top-level configuration. Never point a non-production binding at production data.

## Environment secrets

Store secrets on the GitHub **environment**, not at repository or workflow scope, so approval and access rules apply. Use different credentials for every target.

### Cloudflare (required for Worker deployment)

- `CLOUDFLARE_ACCOUNT_ID`: the owning account ID (not confidential, but kept with the environment configuration).
- `CLOUDFLARE_API_TOKEN`: a dedicated, expiring token scoped to that account and only the deployed Workers plus the exact D1, R2, Queue, and Workers Scripts permissions they require. Do not use the Global API Key, an interactive Wrangler OAuth token, or one token shared by production and non-production.

Runtime values such as `ADMIN_API_TOKEN`, `INGEST_TRIGGER_SECRET`, Gemini/API keys, and signing keys are Cloudflare Worker secrets. Provision them with `wrangler secret put --env <target>`; do not expose them to GitHub unless a workflow must rotate them.

### Expo / EAS (required only when remote EAS builds or submissions are added)

- `EXPO_TOKEN`: a robot/service-account token restricted to this Expo project; never use a developer's personal token.
- Native signing credentials: keep Android keystores and Apple distribution/APNs credentials in EAS Credentials. Prefer App Store Connect API keys limited to the application and Google Play service accounts limited to the required release track. Do not store credential files in the repository.

CI's current Expo check is intentionally credential-free: it resolves the public configuration and produces Android and iOS JavaScript bundles. A future EAS submission job should be placed in the matching protected GitHub environment and use `EXPO_TOKEN` only in that step.

### Monitoring (optional)

- `SENTRY_AUTH_TOKEN` (or the selected provider's equivalent): a project-scoped release/upload token with no organization administration permission.
- `SENTRY_ORG` and `SENTRY_PROJECT`: non-secret release routing values, preferably environment variables rather than secrets.
- Runtime monitoring DSNs are public configuration identifiers; separate them per environment and apply provider-side ingest limits. Never grant monitoring tokens to pull-request workflows from forks.

### Notifications (optional)

- `SLACK_DEPLOY_WEBHOOK_URL`: an environment-specific incoming webhook restricted to one deployment channel. The deploy workflow posts an aggregate outcome when present. Rotate it if disclosed and do not reuse a general-purpose bot token.

## Operational checklist

1. Require the `CI / Lint, type-check, and test` and `CI / Expo and Worker build validation` checks on `main`.
2. Define isolated preview/staging Wrangler environments and run a manual preview deployment.
3. Verify Cloudflare resources, logs, and alarms before promoting the same commit.
4. Dispatch production, have a different reviewer approve the protected environment, and review every independent Worker job plus the notification result.
