# Admin

The internal editorial dashboard is a Next.js App Router application. Choose the
checked-in contract matching the deployment target and copy it to a host-managed
secret environment (use `.env.local` only for development). The API client rejects
an API hostname that does not match `APP_ENVIRONMENT`; development accepts only
loopback hosts. See [`docs/environments.md`](../../docs/environments.md) for staging,
production, provisioning, and promotion procedures.

Authentication creates an eight-hour, HTTP-only signed session cookie. All
privileged backend requests go through `lib/admin-api.ts`, which validates the
session and attaches `ADMIN_API_TOKEN` only on the server. Never import that
module into a client component or expose an admin setting with `NEXT_PUBLIC_`.
