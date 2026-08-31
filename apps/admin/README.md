# Admin

The internal editorial dashboard is a Next.js App Router application. Copy the
admin variables from the repository `.env.example` into `apps/admin/.env.local`,
replace every placeholder, then run `pnpm --filter @toneyarthi/admin dev`.

Authentication is performed by a server action. The resulting eight-hour,
HTTP-only, signed session cookie is checked by the protected route-group layout.
All privileged backend requests must go through `lib/admin-api.ts`; it validates
the session and attaches `ADMIN_API_TOKEN` only while executing on the server.
Do not import that module into a client component or expose any admin setting
with a `NEXT_PUBLIC_` prefix.
