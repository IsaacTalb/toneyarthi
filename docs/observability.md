# Observability and crash reporting

## Data contract

Workers emit one bounded JSON object per event to `console`. Cloudflare Workers
Observability/Logpush can export these records without a runtime SDK. Every event
has `timestamp`, `event`, `level`, `service`, `environment`, and `release`, plus
only applicable opaque `correlationId`, `articleId`, `clusterId`, and `jobId`.
Source URLs, titles, bodies, prompts, generated text, audio scripts, credentials,
headers, and user data must never be added. The shared logger redacts content and
secret-shaped keys, removes URLs, limits strings/arrays/object depth, and caps a
serialized event at 8 KiB (16 KiB maximum configuration).

The API records exceptions; ingestion records per-source and run counts; AI and
TTS consumers record claim/attempt, completion, and bounded failure events.
Mobile installs React Native's Expo-compatible global crash handler and sends a
maximum 1 KiB metadata-only envelope to `/v1/telemetry/crashes`. It deliberately
omits exception messages and stacks. The API converts that envelope into the same
provider-exportable JSON format. Do not put monitoring secrets in `EXPO_PUBLIC_*`.

## Deployment and secrets

Set `ENVIRONMENT` to `development`, `staging`, or `production`, and set `RELEASE`
to the immutable git SHA in every Worker deployment. Expo obtains its release
from `expo.version`; keep it aligned with the EAS build. Enable Workers Logs and
create a Logpush job to the monitoring provider or SIEM. Store its API key using
Cloudflare Logpush destination secrets/account configuration, **not** Wrangler
`vars`, the repository, or the mobile binary. Existing application secrets remain
set with `wrangler secret put <NAME>`.

If switching to a native crash vendor later, initialize its Expo-supported SDK in
the root layout, keep DSN/config in EAS secrets, retain the before-send content
allowlist above, and upload source maps using a CI-only provider auth token.

## Alerts and validation

Create production-only alerts grouped by `service`, `event`, and `release`:

- page on `api.exception` with status 500 or a sustained error-rate increase;
- page on any terminal `tts.failed`, and on repeated `ai.stage.failed`;
- notify when `ingest.run.completed` is absent for seven hours, or accepted/queued
  counts fall to zero for two consecutive runs;
- notify on retry spikes in `queue.attempt`, and on new-release `mobile.crash`;
- exclude development/staging and rate-limit duplicate notifications by job or
  correlation ID, while never attaching raw log payloads to public channels.

After deployment, trigger a synthetic non-content exception in staging, confirm
redaction and size in exported logs, verify environment/release tags, and confirm
alert delivery and recovery before enabling production paging.
