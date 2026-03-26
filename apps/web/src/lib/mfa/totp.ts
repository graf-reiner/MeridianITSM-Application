import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';

const APP_NAME = 'MeridianITSM';

// ─── Encryption helpers (match SSO encryption format: iv:authTag:ciphertext) ──

function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.AUTH_ENCRYPTION_KEY ?? '', 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${enc}`;
}

function decryptSecret(ciphertext: string): string {
  const key = Buffer.from(process.env.AUTH_ENCRYPTION_KEY ?? '', 'hex');
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(parts[2], 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── TOTP Functions ──────────────────────────────────────────────────────────

/**
 * Generate a new TOTP secret. Returns the raw base32 secret (for QR display)
 * and an encrypted version (for database storage).
 */
export function generateTotpSecret(): { secret: string; encrypted: string } {
  const secret = new Secret({ size: 20 });
  const encrypted = encrypt(secret.base32);
  return { secret: secret.base32, encrypted };
}

/**
 * Generate a QR code data URL for the given email and TOTP secret.
 */
export async function generateTotpQrCode(
  email: string,
  secret: string,
): Promise<string> {
  const totp = new TOTP({
    issuer: APP_NAME,
    label: email,
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return QRCode.toDataURL(totp.toString());
}

/**
 * Verify a 6-digit TOTP code against an encrypted secret.
 * Allows a window of +/- 1 period (30 seconds) for clock drift.
 */
export function verifyTotpCode(
  encryptedSecret: string,
  code: string,
): boolean {
  try {
    const decrypted = decryptSecret(encryptedSecret);
    const totp = new TOTP({
      secret: Secret.fromBase32(decrypted),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}
