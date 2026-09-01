# List and media performance audit

## Measurement scope

The mobile review targeted the request/render paths that are deterministic in
source and can be exercised without inventing device results. Physical-device
frame, Java/Kotlin heap, and iOS Instruments captures still need release builds
on the representative older Android and current iPhone hardware; this repository
does not include a device farm. The existing feeds use virtualized `FlatList`s,
bounded render windows, clipped Android subviews, resized cached images, a root
player with narrow state selectors, and provider/driver subscription cleanup.

The Listen screen was the measurable waterfall outlier. Opening it previously
issued morning + audio + categories + four category-feed requests (7 requests).
It now builds up to four category shelves from the audio summary response (2
requests, **71% fewer**) and those rows already have audio URLs, avoiding up to
12 article-detail requests when a shelf starts. No new runtime dependency was
introduced. Playback position persistence was also reduced from at most two
AsyncStorage writes/second to one every five seconds (**10 to 1 writes per five
seconds**) while app-background and provider-disposal flushes remain intact.

## D1 query-plan proxy

Run `python3 scripts/benchmark-list-queries.py` from the repository root. It
uses SQLite (the D1 query engine) with 50,000 representative rows and reports
the median of 30 warm runs. On the 2026-09-01 development container:

| list query            |    before |    after |       result |
| --------------------- | --------: | -------: | -----------: |
| public audio          |  0.324 ms | 0.017 ms | 94.7% faster |
| category feed         |  0.321 ms | 0.017 ms | 94.8% faster |
| admin processing jobs | 27.011 ms | 0.088 ms | 99.7% faster |

Before, all three plans created a temporary B-tree for ordering (and processing
jobs scanned the table). After, each uses its matching index with no temporary
sort. These are local comparative measurements, not claims about production D1
latency; use `wrangler d1 execute --remote --command "EXPLAIN QUERY PLAN ..."`
against production distributions before and after migration `0028`.

## Boundary and delivery findings

- Public article feeds share a summary projection that excludes body columns;
  the body is selected only by article detail.
- Public page size remains capped at 50 and the maximum page is now 500. Admin
  playlist/source lists and playlist membership are capped at 50/100/100.
- Feed cache metadata now separates the 60-second browser TTL from a 300-second
  shared-cache TTL and retains stale-while-revalidate and ETag validation.
- Normalized image variants already carry immutable one-year R2 cache metadata.
  Final audio assets now receive the same immutable cache policy along with the
  existing `audio/wav` content type and validation metadata.

## Physical-device acceptance run

For each target device, use a release build and record cold launch plus three
passes through Home, Explore, article detail, Listen, player, background/return,
and back navigation. Capture JS/UI FPS, slow/frozen frames, native/JS heap before
and after 100 feed rows, decoded-image heap, request count/bytes, and listener
counts after five navigation/background cycles. Acceptance requires no monotonic
heap/listener growth, no duplicate API page request, no article-detail request
when starting an audio shelf, and continued background-player controls. Keep the
device captures with the release artifact rather than committing synthesized
numbers here.
