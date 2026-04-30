import { createHash } from 'node:crypto';

/**
 * Stable 16-hex-character fingerprint of an ENCRYPTION_KEY.
 * Used to label backups so users can confirm key compatibility before restore.
 * Not cryptographically meaningful — just a visual hash.
 */
export function keyFingerprint(envKey: string): string {
  if (!envKey) return '(missing)';
  return createHash('sha256').update(envKey).digest('hex').slice(0, 16);
}
