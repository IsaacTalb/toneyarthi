# Media storage

`@toneyarthi/media` is the backend-only contract for objects stored in the
project's Cloudflare R2 bucket. It builds and validates keys in the `audio/`,
`images/`, and `thumbnails/` namespaces, uploads objects with HTTP/custom
metadata, checks existence, deletes only validated media keys, and constructs
public URLs. It intentionally does not implement downloads, streaming, or
text-to-speech.

## Create and bind the bucket

Create the production bucket once:

```sh
pnpm exec wrangler r2 bucket create tone-yar-thi-media
```

Every Worker that uses this package must expose these bindings:

```toml
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "tone-yar-thi-media"

[vars]
MEDIA_PUBLIC_BASE_URL = "https://pub-<account-specific-id>.r2.dev"
```

Model the Worker environment with `MediaBindings` (or extend it) so a missing
`MEDIA_BUCKET` binding or `MEDIA_PUBLIC_BASE_URL` variable is a type error. Do
not put secrets in `[vars]`; this URL is public configuration.

## Public access

R2 buckets are private by default. For development or initial deployment,
enable the bucket's Cloudflare-managed `r2.dev` public URL in the R2 dashboard
and set `MEDIA_PUBLIC_BASE_URL` to that origin. Public development URLs are
rate-limited and are not intended for production traffic.

For production, the future setup is to attach a custom domain to the bucket in
the R2 dashboard, configure caching/access controls there, and replace
`MEDIA_PUBLIC_BASE_URL` with the custom HTTPS origin. No code change should be
needed. A custom domain is documented here but is deliberately not provisioned
by this package.

Wrangler provides local R2 persistence to Workers, but the configured public
hostname does **not** expose that local bucket. Consequently URL construction
can be tested locally, while fetching the resulting URL requires a remotely
published object (or a separate application endpoint, which this package does
not provide). Use `wrangler dev --remote` only when remote resource access is
intentional.

## Usage

```ts
import {
  audioKey,
  mediaExists,
  mediaUrl,
  uploadMedia,
  type MediaBindings,
} from '@toneyarthi/media';

const key = audioKey('article-123.mp3');
await uploadMedia(env.MEDIA_BUCKET, key, bytes, {
  contentType: 'audio/mpeg',
  cacheControl: 'public, max-age=86400',
  metadata: { articleId: 'article-123' },
});

if (await mediaExists(env.MEDIA_BUCKET, key)) {
  const url = mediaUrl(env satisfies MediaBindings, key);
}
```

Identifiers are intentionally a single safe path segment. Generate the key
with `audioKey`, `imageKey`, or `thumbnailKey`; do not cast arbitrary strings to
`MediaKey`.
