export type AdapterErrorCode = 'transport' | 'http' | 'invalid-feed';

export class NewsSourceAdapterError extends Error {
  readonly sourceSlug: string;
  readonly code: AdapterErrorCode;

  constructor(
    sourceSlug: string,
    code: AdapterErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NewsSourceAdapterError';
    this.sourceSlug = sourceSlug;
    this.code = code;
  }
}
