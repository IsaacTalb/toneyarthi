import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger } from '../src/observability.ts';

test('redacts content and secrets and bounds the payload', () => {
  let output = '';
  const logger = createLogger({
    service: 'test',
    maxBytes: 1024,
    sink: (line) => (output = line),
  });
  logger.event('failed', 'error', {
    body: 'private story',
    token: 'secret',
    safe: 'https://example.com/private',
    huge: 'x'.repeat(5000),
  });
  assert.ok(Buffer.byteLength(output) <= 1024);
  assert.doesNotMatch(output, /private story|example\.com|"secret"/);
  assert.match(output, /\[REDACTED\]/);
});
