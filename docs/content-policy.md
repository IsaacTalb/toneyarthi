# Content and source policy

## Source selection

Use reputable, identifiable publishers with a public editorial presence and a
stable canonical article URL. Prefer primary reporting and official records;
use multiple independent sources for disputed or consequential claims. Do not
ingest anonymous scrapes, content farms, or material whose authenticity cannot
be assessed.

## Access and paywalls

Only retrieve material the publisher makes available through an authorized
feed, API, or ordinary public page. Never defeat a paywall, authentication,
robots control, technical access restriction, or publisher usage limit. A
headline or feed excerpt may identify a story, but inaccessible text must not be
reconstructed or represented as reviewed.

## Retention and public exposure

Retain only the source material needed for fact extraction and verification.
Ingestion bounds transient source text; after a structured extraction succeeds,
delete that text. Do not put full source text in queues, job results, logs,
analytics, public APIs, caches, or generated drafts. Long-term records should
contain extracted facts, the original title and publication time, publisher,
canonical source link, retrieval time, and integrity/deduplication identifiers.
Operational backups must follow the same deletion lifecycle.

Public article responses and views must expose only the original Burmese
synthesis, never a fallback copy of the source body. Admin access to provenance
does not authorize retaining or displaying an unnecessary full source copy.

## Original Burmese synthesis

Write a new Burmese account from verified facts rather than translating or
closely paraphrasing the structure of a source. Combine sources where useful,
distinguish reported claims from established facts, preserve uncertainty, and
never invent context. Editorial review must check the synthesis against the
linked sources and extracted evidence.

## Attribution, metadata, and links

Every article API representation—including lists—must include its publisher
attribution and direct original article link. Mobile and admin article views
must display that attribution and provide a working link. Preserve the original
publication title and timestamp as source metadata; do not overwrite them with
Toneyar Thi's publication time or Burmese headline. Name each material source,
including syndicated sources when known, and link to the canonical article
rather than a search result, tracking redirect, copied page, or publisher home
page.

## Quotations

Quote only when the exact wording is newsworthy and use the shortest passage
needed. Clearly mark the words as a quotation, name the speaker and publisher,
and link to the original publication. Do not assemble quotations to substitute
for the article, reproduce substantial passages, or translate a quote in a way
that changes its meaning.

## Image rights and provenance

An image appearing in a feed is not permission to republish it. Reuse requires
an explicit provenance record identifying the asset, source or creator, license
or permission basis, required credit, and any scope or expiry terms. Allowed
classes are permitted publisher assets, licensed assets, documented editorial
uploads, and owned category fallbacks. The published variant must remain tied to
that record.

If any right, license term, attribution, identity, or permitted transformation
is uncertain, do not copy, proxy, cache, or display the source image. Use an
owned category fallback or a text-only presentation instead. Editors must
re-check expiring or revoked permissions and remove affected derivatives.
