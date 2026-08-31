/** Immutable source configuration; admin APIs may only select these entries. */
export const SOURCE_DEFINITIONS = [
  {
    slug: 'bbc-world',
    name: 'BBC News',
    siteUrl: 'https://www.bbc.com/news',
    feedUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    language: 'en-GB',
    adapterType: 'rss',
  },
  {
    slug: 'npr-news',
    name: 'NPR',
    siteUrl: 'https://www.npr.org/',
    feedUrl: 'https://feeds.npr.org/1001/rss.xml',
    language: 'en-US',
    adapterType: 'rss',
  },
  {
    slug: 'nasa-breaking-news',
    name: 'NASA',
    siteUrl: 'https://www.nasa.gov/',
    feedUrl: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',
    language: 'en-US',
    adapterType: 'rss',
  },
] as const;

export const sourceDefinitionRegistry: ReadonlyMap<
  string,
  (typeof SOURCE_DEFINITIONS)[number]
> = new Map(SOURCE_DEFINITIONS.map((source) => [source.slug, source]));
