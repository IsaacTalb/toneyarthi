# Mobile analytics policy

## Architecture and reliability

The mobile client sends typed events through a provider-neutral `AnalyticsProvider`.
Development uses the built-in no-op provider; production wiring may inject a provider
without changing product code. Dispatch is deferred and all synchronous errors and
promise rejections are discarded. Analytics is best-effort: a failed, slow, or absent
provider must never block navigation, playback, saving, downloading, or any other user
action.

## Event catalogue

| Event               | Collected properties                                                         | Rule                                                                     |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `article_open`      | internal `article_id`, enumerated `entry_point`                              | Once when an article response is displayed                               |
| `audio_started`     | internal `article_id`, rounded duration in seconds when known                | First successful play per loaded item                                    |
| `audio_paused`      | internal `article_id`, rounded position in seconds                           | Successful pause                                                         |
| `audio_progress`    | internal `article_id`, milestone (`25`, `50`, or `75`)                       | Each milestone at most once per loaded item; no periodic position stream |
| `audio_completed`   | internal `article_id`, rounded duration in seconds                           | Playback reaches the end                                                 |
| `save_changed`      | internal `article_id`, `saved` or `removed`                                  | Only after local persistence succeeds                                    |
| `download_changed`  | internal `article_id`, `downloaded` or `removed`, automatic flag             | Only after storage succeeds                                              |
| `playlist_started`  | item count and zero-based start index                                        | Autoplay starts a queue containing multiple items                        |
| `search_completed`  | Unicode character count and result count                                     | Once per completed normalized term; **the term is not collected**        |
| `notification_open` | enumerated notification type and validated internal article ID, when present | User opens a notification                                                |

## Retention and access

The app itself does not persist analytics events. Before enabling a production
provider, the data owner must configure event-level retention of **90 days or less**,
delete or aggregate expired raw events, restrict access to staff with a documented
product-analysis need, and document any provider subprocessors and backup-deletion
lag. Longer retention requires a reviewed, documented purpose and aggregation that
removes installation-level identifiers.

## Consent and control

Analytics must remain disabled (the no-op implementation) until the applicable
consent or other documented lawful basis is satisfied. Where consent is required, it
must be freely given, specific, informed, revocable, and separate from push
permission. Withdrawal must stop future collection without degrading core features.
Do not infer analytics consent from notification permission, account creation, or use
of the app. Regional requirements and the configured provider must be reviewed before
release.

## Prohibited fields

Never add names, email addresses, phone numbers, account or advertising identifiers,
precise location, IP addresses as event properties, device fingerprints, free-form
text, search terms, notification body/title, article title/summary/body, audio
transcripts, source names, source URLs, author names, or any other publisher/source
content. Do not encode prohibited data into IDs or custom event names. New events and
properties require privacy review, schema updates, tests, and an update to this
catalogue before collection begins.
