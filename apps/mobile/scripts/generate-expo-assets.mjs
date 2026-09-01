import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, '../assets');
const colors = {
  brand: [49, 92, 61],
  canvas: [248, 246, 240],
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const type = Buffer.from(name);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function encodePng(width, height, pixels, hasAlpha) {
  const channels = hasAlpha ? 4 : 3;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = hasAlpha ? 6 : 2;

  const scanlines = Buffer.alloc((width * channels + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const targetOffset = row * (width * channels + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(
      scanlines,
      targetOffset + 1,
      row * width * channels,
      (row + 1) * width * channels,
    );
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedRectangle(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, right - radius));
  const nearestY = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function insideTriangle(x, y, [a, b, c]) {
  const cross = (p, q, r) =>
    (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const point = [x, y];
  const d1 = cross(point, a, b);
  const d2 = cross(point, b, c);
  const d3 = cross(point, c, a);
  return !(d1 < 0 || d2 < 0 || d3 < 0) || !(d1 > 0 || d2 > 0 || d3 > 0);
}

function insideMark(x, y) {
  const bubble = insideRoundedRectangle(x, y, 300, 270, 724, 658, 120);
  const tail = insideTriangle(x, y, [
    [396, 620],
    [476, 650],
    [366, 742],
  ]);
  return bubble || tail;
}

function insideBars(x, y) {
  return (
    insideRoundedRectangle(x, y, 402, 420, 446, 532, 22) ||
    insideRoundedRectangle(x, y, 490, 360, 534, 592, 22) ||
    insideRoundedRectangle(x, y, 578, 400, 622, 552, 22)
  );
}

function render({ size, background, mark, bars, opaque = false }) {
  const channels = opaque ? 3 : 4;
  const pixels = Buffer.alloc(size * size * channels);
  const scale = 1024 / size;
  const samples = [0.25, 0.75];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let markCoverage = 0;
      let barCoverage = 0;
      for (const sampleY of samples) {
        for (const sampleX of samples) {
          const sourceX = (x + sampleX) * scale;
          const sourceY = (y + sampleY) * scale;
          if (insideMark(sourceX, sourceY)) markCoverage += 0.25;
          if (insideBars(sourceX, sourceY)) barCoverage += 0.25;
        }
      }

      const coverage = Math.max(markCoverage, barCoverage);
      const foreground = barCoverage > 0 ? bars : mark;
      const index = (y * size + x) * channels;
      if (background) {
        for (let channel = 0; channel < 3; channel += 1) {
          pixels[index + channel] = Math.round(
            background[channel] * (1 - coverage) +
              foreground[channel] * coverage,
          );
        }
        if (!opaque) pixels[index + 3] = 255;
      } else {
        pixels[index] = foreground[0];
        pixels[index + 1] = foreground[1];
        pixels[index + 2] = foreground[2];
        pixels[index + 3] = Math.round(coverage * 255);
      }
    }
  }

  return encodePng(size, size, pixels, !opaque);
}

const assets = [
  [
    'icon.png',
    {
      size: 1024,
      background: colors.brand,
      mark: colors.canvas,
      bars: colors.brand,
      opaque: true,
    },
  ],
  [
    'adaptive-icon.png',
    { size: 1024, mark: colors.canvas, bars: colors.brand },
  ],
  ['splash-icon.png', { size: 512, mark: colors.brand, bars: colors.canvas }],
  [
    'splash-icon-dark.png',
    { size: 512, mark: colors.canvas, bars: colors.brand },
  ],
];

export function generateExpoAssets() {
  mkdirSync(outputDirectory, { recursive: true });
  for (const [filename, specification] of assets) {
    writeFileSync(resolve(outputDirectory, filename), render(specification));
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  generateExpoAssets();
  for (const [filename] of assets) {
    process.stdout.write(`Generated assets/${filename}\n`);
  }
}
