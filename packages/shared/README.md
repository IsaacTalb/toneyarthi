# Shared

Cross-runtime utilities live here. Shared data contracts are exported from the
dedicated `@toneyarthi/types` package.

The package's article pipeline removes HTML and page chrome, normalizes text,
titles, URLs, and dates, enforces conservative document limits, and calculates
stable SHA-256 content fingerprints. `validateAndNormalizeArticle` returns a
discriminated accepted/rejected result; rejection diagnostics contain only
bounded identifying metadata rather than raw source documents.
