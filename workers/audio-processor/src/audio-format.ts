export const WAV_HEADER_BYTES = 44;
const PCM_BITS_PER_SAMPLE = 16;

export function wavFromPcm(data: Uint8Array, mimeType: string) {
  const rateMatch = /rate=(\d+)/i.exec(mimeType);
  const sampleRate = Number(rateMatch?.[1] ?? 24_000);
  const channelsMatch = /channels=(\d+)/i.exec(mimeType);
  const channels = Number(channelsMatch?.[1] ?? 1);
  if (
    !/^audio\/(?:l16|pcm)(?:;|$)/i.test(mimeType) ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate <= 0 ||
    channels !== 1 ||
    data.byteLength % (PCM_BITS_PER_SAMPLE / 8)
  )
    throw new Error(`Unsupported or malformed TTS audio format: ${mimeType}`);
  const output = new Uint8Array(WAV_HEADER_BYTES + data.byteLength);
  const view = new DataView(output.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  text(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);
  text(36, 'data');
  view.setUint32(40, data.byteLength, true);
  output.set(data, WAV_HEADER_BYTES);
  return {
    data: output,
    sampleRate,
    channels,
    bitrateBps: sampleRate * channels * PCM_BITS_PER_SAMPLE,
    durationSeconds: data.byteLength / 2 / sampleRate,
  };
}

export function validateWavHeader(data: Uint8Array): boolean {
  if (data.byteLength <= WAV_HEADER_BYTES) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = (offset: number, length: number) =>
    new TextDecoder().decode(data.subarray(offset, offset + length));
  return (
    text(0, 4) === 'RIFF' &&
    view.getUint32(4, true) === data.byteLength - 8 &&
    text(8, 4) === 'WAVE' &&
    text(12, 4) === 'fmt ' &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint16(34, true) === PCM_BITS_PER_SAMPLE &&
    text(36, 4) === 'data' &&
    view.getUint32(40, true) === data.byteLength - WAV_HEADER_BYTES
  );
}
