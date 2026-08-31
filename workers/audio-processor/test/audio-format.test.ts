import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateWavHeader, wavFromPcm } from '../src/audio-format.ts';

describe('Gemini PCM packaging', () => {
  it('writes and validates an exact mono PCM WAV header', () => {
    const result = wavFromPcm(new Uint8Array(48_000), 'audio/L16;rate=24000');
    assert.equal(result.sampleRate, 24_000);
    assert.equal(result.channels, 1);
    assert.equal(result.bitrateBps, 384_000);
    assert.equal(result.durationSeconds, 1);
    assert.equal(validateWavHeader(result.data), true);
  });

  it('rejects unsupported codecs, stereo, and malformed samples', () => {
    assert.throws(() => wavFromPcm(new Uint8Array(2), 'audio/ogg'));
    assert.throws(() =>
      wavFromPcm(new Uint8Array(2), 'audio/L16;rate=24000;channels=2'),
    );
    assert.throws(() => wavFromPcm(new Uint8Array(1), 'audio/pcm;rate=24000'));
  });

  it('detects a corrupt output length header', () => {
    const result = wavFromPcm(new Uint8Array(4), 'audio/pcm;rate=24000');
    result.data[40] = 99;
    assert.equal(validateWavHeader(result.data), false);
  });
});
