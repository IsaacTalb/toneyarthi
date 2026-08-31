# Media storage

`@toneyarthi/media` is the backend-only contract for objects stored in the
project's Cloudflare R2 bucket. It builds and validates keys in the `audio/`,
`images/`, and `thumbnails/` namespaces, uploads objects with HTTP/custom
metadata, checks existence, deletes only validated media keys, and constructs
public URLs. The image pipeline additionally enforces HTTPS and an exact-host
allowlist on every redirect, bounded downloads, MIME/magic-byte agreement, and
optional Cloudflare image transforms. It intentionally does not implement
text-to-speech.

## Authorized images

Call `fetchApprovedImage` only after the editorial/source registry has supplied
an `ApprovedImageSource` policy. Redirects are manual so that HTTPS and the
allowlist are checked again at every hop. The response is streamed through a
hard byte limit and accepted only when its declared JPEG, PNG, WebP, or GIF MIME
type agrees with its signature. SVG is deliberately not accepted from remote
sources. A configured `cloudflareTransform` is passed through the Workers
`cf.image` request option and requests metadata-stripped WebP output.

`storeImageVariants` writes immutable article and thumbnail objects under the
normalized `images/<article>.<extension>` and
`thumbnails/<article>.<extension>` keys and puts serialized provenance on both
objects. `persistImageProvenance` upserts the same provenance and both keys into
D1. Apply migration `0020_add_article_images.sql` before using it.

Permitted publisher media, licensed provider assets, editorial uploads, and
project-owned category fallbacks have distinct discriminated provenance types
in `@toneyarthi/types`. If acquisition or processing fails, use
`withCategoryFallback` with `categoryFallbackArtwork`; the compact,
deterministic SVG has article and thumbnail sizes and requires no network. The
image path must remain optional to the publication state machine: log the
original failure, use fallback art where storage is available, and continue
publication even if fallback storage also has an infrastructure failure.

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
