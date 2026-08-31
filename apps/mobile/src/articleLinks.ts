const DEFAULT_PUBLIC_ORIGIN = 'https://toneyarthi.com';

/** Returns an HTTPS URL without credentials, suitable for opening externally. */
export function validatedHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Builds a shareable web URL and never exposes a development API address. */
export function articlePublicUrl(slug: string): string {
  const configured = validatedHttpsUrl(process.env.EXPO_PUBLIC_SITE_URL ?? '');
  const origin = configured
    ? new URL(configured).origin
    : DEFAULT_PUBLIC_ORIGIN;
  return new URL(`/article/${encodeURIComponent(slug)}`, origin).toString();
}
