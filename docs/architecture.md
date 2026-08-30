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
