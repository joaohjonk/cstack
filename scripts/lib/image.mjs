// Deterministic image checks with zero dependencies (section 13 automated audits).
// Reads dimensions from PNG / JPEG / WebP / GIF headers; audits unintended reframing.
import fs from 'node:fs';

export function imageSize(file) {
  const b = fs.readFileSync(file);
  // PNG
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), format: 'png' };
  // GIF
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), format: 'gif' };
  // WebP
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), format: 'webp' };
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, format: 'webp' };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), format: 'webp' };
    }
  }
  // JPEG: walk markers to SOFn
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf))
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), format: 'jpeg' };
      i += 2 + len;
    }
  }
  throw new Error(`unsupported or corrupt image: ${file}`);
}

/**
 * Size audit (Superside pattern, stricter): aspect drift beyond tolerance FAILS (the model recomposed
 * or the pipeline reframed); area loss beyond tolerance WARNS (resolution dropped).
 * expected: {width, height} | {aspect: 'W:H', min_width}
 */
export function sizeAudit(actual, expected, { aspectTol = 0.04, areaTol = 0.5 } = {}) {
  const findings = [];
  const expAspect = expected.aspect ? (([w, h]) => w / h)(expected.aspect.split(':').map(Number)) : expected.width / expected.height;
  const actAspect = actual.width / actual.height;
  const drift = Math.abs(actAspect - expAspect) / expAspect;
  if (drift > aspectTol) findings.push({ level: 'fail', check: 'aspect', detail: `aspect ${actAspect.toFixed(4)} vs expected ${expAspect.toFixed(4)} (drift ${(drift * 100).toFixed(1)}% > ${aspectTol * 100}%): unintended reframe` });
  if (expected.width && expected.height) {
    const loss = 1 - (actual.width * actual.height) / (expected.width * expected.height);
    if (loss > areaTol) findings.push({ level: 'warn', check: 'area', detail: `area ${(loss * 100).toFixed(0)}% below expected: upscale only approved finals` });
  }
  if (expected.min_width && actual.width < expected.min_width) findings.push({ level: 'fail', check: 'min_width', detail: `width ${actual.width} < ${expected.min_width}` });
  return { ok: !findings.some((f) => f.level === 'fail'), findings };
}
