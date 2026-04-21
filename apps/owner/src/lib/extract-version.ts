/**
 * Extract a version string (e.g. "1.0.0.1") from an agent installer binary.
 *
 * Works for:
 *   - Windows MSI (CFB container; the Property table stores ProductVersion as a
 *     UTF-16LE string).
 *   - Windows EXE (PE format; VERSIONINFO resource stores FileVersion /
 *     ProductVersion as UTF-16LE strings).
 *
 * Strategy: scan the binary for UTF-16LE occurrences of "ProductVersion" or
 * "FileVersion", then look ahead for a version-shaped string in the
 * surrounding window. Falls back to null if nothing plausible is found.
 */

// Greedy: prefer longer dotted versions. No trailing \b because MSI Property
// table concatenates strings without separators (e.g. "1.0.0.1UpgradeCode").
const VERSION_PATTERN = /(?:^|[^\d.])(\d+\.\d+(?:\.\d+){0,2})/;
const KEYS = ['ProductVersion', 'FileVersion'];

function indexOfUtf16LE(buf: Buffer, needle: string, fromIndex: number): number {
  const needleBuf = Buffer.from(needle, 'utf16le');
  return buf.indexOf(needleBuf, fromIndex);
}

function scanWindowUtf16LE(buf: Buffer, keyLen: number, matchIdx: number): string | null {
  const start = matchIdx + keyLen * 2;
  const end = Math.min(start + 256, buf.length);
  const region = buf.subarray(start, end).toString('utf16le');
  const match = region.match(VERSION_PATTERN);
  return match ? match[1] : null;
}

function scanWindowUtf8(buf: Buffer, keyLen: number, matchIdx: number): string | null {
  const start = matchIdx + keyLen;
  const end = Math.min(start + 128, buf.length);
  const region = buf.subarray(start, end).toString('utf8');
  const match = region.match(VERSION_PATTERN);
  return match ? match[1] : null;
}

/**
 * Returns a detected version string, or null if no plausible version was found.
 * Prefers matches with more components (e.g. "1.0.0.1" over "1.0").
 */
export function extractVersion(buf: Buffer): string | null {
  const candidates: string[] = [];

  for (const key of KEYS) {
    let i = indexOfUtf16LE(buf, key, 0);
    while (i >= 0 && candidates.length < 20) {
      const v = scanWindowUtf16LE(buf, key.length, i);
      if (v) candidates.push(v);
      i = indexOfUtf16LE(buf, key, i + 1);
    }

    const asciiNeedle = Buffer.from(key, 'utf8');
    let j = buf.indexOf(asciiNeedle);
    while (j >= 0 && candidates.length < 40) {
      const v = scanWindowUtf8(buf, key.length, j);
      if (v) candidates.push(v);
      j = buf.indexOf(asciiNeedle, j + 1);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ca = a.split('.').length;
    const cb = b.split('.').length;
    if (ca !== cb) return cb - ca;
    return b.localeCompare(a, undefined, { numeric: true });
  });

  return candidates[0];
}
