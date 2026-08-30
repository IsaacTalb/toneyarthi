import { NewsSourceAdapterError } from './errors.ts';

export interface RssItem {
  title?: string;
  link?: string;
  guid?: string;
  description?: string;
  content?: string;
  author?: string;
  published?: string;
  imageUrl?: string;
}

const decode = (value: string): string =>
  value
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

const field = (xml: string, names: string[]): string | undefined => {
  for (const name of names) {
    const escaped = name.replace(':', '\\:');
    const match = xml.match(
      new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'),
    );
    if (match) return decode(match[1]);
  }
  return undefined;
};

/** Parse RSS into transport-neutral fields. Invalid individual items are retained for mappers to reject. */
export function parseRss(xml: string, sourceSlug: string): RssItem[] {
  if (!/<(?:rss|rdf:RDF)\b/i.test(xml) || !/<channel\b/i.test(xml)) {
    throw new NewsSourceAdapterError(
      sourceSlug,
      'invalid-feed',
      'Response is not an RSS feed',
    );
  }
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  return blocks.map((match) => {
    const item = match[1];
    const enclosure = item.match(
      /<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["'][^>]*>/i,
    );
    return {
      title: field(item, ['title']),
      link: field(item, ['link']),
      guid: field(item, ['guid']),
      description: field(item, ['description']),
      content: field(item, ['content:encoded']),
      author: field(item, ['dc:creator', 'author']),
      published: field(item, ['pubDate', 'dc:date']),
      imageUrl: enclosure ? decode(enclosure[1]) : undefined,
    };
  });
}
