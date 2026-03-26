import crypto from 'crypto';

/**
 * Decrypt a value encrypted with AES-256-GCM.
 * Format: iv:authTag:ciphertext (all base64-encoded).
 * Matches the encryption format used by apps/api/src/lib/encryption.ts.
 */
export function decrypt(ciphertext: string): string {
  const key = process.env.AUTH_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('AUTH_ENCRYPTION_KEY environment variable is required');
  }

  const keyBuffer = Buffer.from(key, 'hex');
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
