export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ObservabilityContext {
  correlationId?: string;
  articleId?: string;
  clusterId?: string;
  jobId?: string;
}

export interface LoggerOptions {
  service: string;
  environment?: string;
  release?: string;
  maxBytes?: number;
  sink?: (line: string, level: LogLevel) => void;
}

const SENSITIVE =
  /(authorization|cookie|token|secret|password|api[-_]?key|dsn)/i;
const CONTENT = /^(body|content|text|prompt|output|title|summary|script|url)$/i;
const MAX_STRING = 256;

function clean(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE.test(key) || CONTENT.test(key)) return '[REDACTED]';
  if (depth > 4) return '[TRUNCATED]';
  if (typeof value === 'string')
    return value
      .replace(/https?:\/\/\S+/gi, '[URL_REDACTED]')
      .replace(/(bearer\s+|api[-_ ]?key\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
      .replace(
        /(authorization|cookie|token|secret|password|dsn)\s*[:=]\s*\S+/gi,
        '$1=[REDACTED]',
      )
      .slice(0, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null)
    return value;
  if (value instanceof Error)
    return {
      name: value.name.slice(0, 80),
      message: clean(value.message, 'message', depth + 1),
    };
  if (Array.isArray(value))
    return value.slice(0, 25).map((item) => clean(item, key, depth + 1));
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([childKey, child]) => [
          childKey,
          clean(child, childKey, depth + 1),
        ]),
    );
  return String(value).slice(0, MAX_STRING);
}

export function correlationId(request?: Request): string {
  const supplied = request?.headers.get('x-correlation-id');
  return supplied && /^[A-Za-z0-9_-]{8,64}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function createLogger(
  options: LoggerOptions,
  context: ObservabilityContext = {},
) {
  const maxBytes = Math.max(1024, Math.min(options.maxBytes ?? 8192, 16_384));
  const sink =
    options.sink ??
    ((line: string, level: LogLevel) => {
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    });
  return {
    event(
      event: string,
      level: LogLevel = 'info',
      fields: Record<string, unknown> = {},
    ) {
      const base = clean({
        timestamp: new Date().toISOString(),
        event,
        level,
        service: options.service,
        environment: options.environment ?? 'development',
        release: options.release ?? 'unknown',
        ...context,
        ...fields,
      }) as Record<string, unknown>;
      let line = JSON.stringify(base);
      if (new TextEncoder().encode(line).byteLength > maxBytes)
        line = JSON.stringify({
          ...base,
          fields: undefined,
          payloadTruncated: true,
        }).slice(0, maxBytes);
      sink(line, level);
    },
  };
}
