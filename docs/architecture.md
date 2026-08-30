# Architecture

## Goals

The workspace separates the user-facing Expo application from independently
deployable edge processes. Boundaries are intentionally small so that ingestion,
AI work, and audio work can scale and fail independently. The first milestone
only exposes health responses; infrastructure bindings will be added alongside
the features that use them.

## Intended distributed pipeline

```text
Expo mobile app
      |
      v
 API Worker ---> ingestion request ---> Ingest Worker
                                         |
                                         v
                                  normalized work item
                                    /             \
                                   v               v
                         AI Processor       Audio Processor
                                   \               /
                                    v             v
                              persisted result + media
                                         |
                                         v
                                  API read model
```

1. **API Worker** will authenticate clients, validate requests, and expose
   stable read/write endpoints to the app.
2. **Ingest Worker** will accept source material, normalize metadata, and split
   inputs into explicit units of work.
3. **AI Processor** will enrich normalized text while preserving the source and
   provenance of generated fields.
4. **Audio Processor** will prepare speech/audio derivatives and their metadata.
5. Processed records will become readable through the API rather than being
   coupled directly to processor implementations.

The transport and storage arrows are architectural intent, not current
bindings. Queue delivery, D1 persistence, R2 media storage, and Gemini behavior
must each arrive with retry, idempotency, observability, and data-retention
decisions. Until then, every Worker is a deployable health endpoint only.

## Workspace conventions

- TypeScript strict mode is inherited from `tsconfig.base.json`.
- Worker packages own deployment configuration and may be released separately.
- Shared code belongs in `packages` only after at least two consumers need it.
- Database changes will be append-only migrations under `database/migrations`;
  local seed fixtures belong under `database/seeds`.
- Secrets never enter the repository. `.env.example` documents local variable
  names without values that grant access.

## Queue contracts and delivery policy

Workers exchange the versioned `QueueJobPayload` contract from
`@toneyarthi/types`. Version 1 contains only `version`, `jobId`, `articleId`, and
`type`; consumers validate every untrusted body before accessing it. Adding or
changing fields requires a new version and a period in which consumers accept
both versions.

The ingest Worker produces `news-processing` messages. The AI Worker consumes
that queue and is also bound as a producer for `tts-processing`; the audio
Worker consumes the latter. Queue settings are intentionally explicit:

| Queue             | Consumer        | Batch size | Batch timeout |                Retries | Dead letter queue     |
| ----------------- | --------------- | ---------: | ------------: | ---------------------: | --------------------- |
| `news-processing` | AI Processor    |         10 |     5 seconds | 2 (3 total deliveries) | `news-processing-dlq` |
| `tts-processing`  | Audio Processor |          5 |     5 seconds | 2 (3 total deliveries) | `tts-processing-dlq`  |

A consumer conditionally changes an eligible D1 row from `pending` to
`processing` and increments `attempts` in the same statement. Duplicate messages
for completed jobs are acknowledged without work. A processing failure stores a
bounded error and returns the job to `pending` while attempts remain; the
message is explicitly retried with delay. On the final failed delivery the row
becomes `failed` and the requested retry causes Cloudflare Queues to move the
message to its dead-letter queue. Invalid payloads are logged and acknowledged
as poison messages rather than retried. Operators must monitor both dead-letter
queues and may redrive a message only after returning its job row to `pending`
and confirming that `attempts < max_attempts`.
