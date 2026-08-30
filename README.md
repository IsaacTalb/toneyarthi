# Tone Yar Thi

Tone Yar Thi is a pnpm monorepo for a Burmese-capable mobile experience and a
set of small Cloudflare Workers. This initial scaffold deliberately contains no
Gemini, D1, R2, or Queue integration.

## Prerequisites

- Node.js 22 or newer
- pnpm 10.28.1 (Corepack can install the version declared in `package.json`)
- Expo Go or a platform simulator for mobile development

## Getting started

```sh
corepack enable
pnpm install
cp .env.example .env
pnpm mobile:start
```

## Workspace commands

| Command                | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `pnpm format`          | Format tracked source and configuration files.            |
| `pnpm format:check`    | Check formatting without changing files.                  |
| `pnpm lint`            | Run ESLint across the workspace.                          |
| `pnpm typecheck`       | Type-check every package that defines a typecheck script. |
| `pnpm mobile:start`    | Start the Expo development server.                        |
| `pnpm mobile:config`   | Resolve and print the public Expo configuration.          |
| `pnpm workers:dry-run` | Build every Worker with Wrangler without deploying.       |

Package-specific commands can be run with pnpm filters, for example:

```sh
pnpm --filter @toneyarthi/api dev
pnpm --filter @toneyarthi/mobile typecheck
```

## Repository map

- `apps/mobile` — Expo Router application.
- `workers/*` — independently deployable edge services.
- `packages/*` — shared contracts, utilities, and configuration as they emerge.
- `database/*` — migrations and seed data once persistence is introduced.
- `docs` — architecture and engineering decisions.

The intended asynchronous processing flow and service boundaries are described
in [`docs/architecture.md`](docs/architecture.md).

R2 media setup and the shared backend helpers are documented in
[`packages/media/README.md`](packages/media/README.md).

## Cloudflare D1

Each Worker includes an example `DB` binding that points at the same placeholder
database IDs. Create the database once, then replace `database_id` (and, if
used, `preview_database_id`) in every `workers/*/wrangler.toml` with the IDs
printed by Wrangler:

```sh
pnpm exec wrangler d1 create tone-yar-thi
```

Migrations are ordered under `database/migrations`. Any Worker config can drive
them; the API Worker is used here as the canonical entry point:

```sh
# Apply to the local Wrangler database.
pnpm exec wrangler d1 migrations apply tone-yar-thi --local --config workers/api/wrangler.toml

# Apply to the remote Cloudflare D1 database.
pnpm exec wrangler d1 migrations apply tone-yar-thi --remote --config workers/api/wrangler.toml
```

Reference categories are intentionally separate from schema migrations and can
be safely applied more than once:

```sh
pnpm exec wrangler d1 execute tone-yar-thi --local --config workers/api/wrangler.toml --file database/seeds/0001_categories.sql
pnpm exec wrangler d1 execute tone-yar-thi --remote --config workers/api/wrangler.toml --file database/seeds/0001_categories.sql
```
