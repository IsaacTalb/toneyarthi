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
