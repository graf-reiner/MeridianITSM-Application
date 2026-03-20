import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';

/**
 * Generates a new TOTP secret and OTPAuth URL for MFA setup.
 * Returns the base32-encoded secret and the otpauth:// URI for QR code generation.
 */
export function generateTotpSecret(email: string): { secret: string; otpauthUrl: string } {
  const totp = new TOTP({
    issuer: 'MeridianITSM',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  return {
    secret: totp.secret.base32,
    otpauthUrl: totp.toString(),
  };
}

/**
 * Generates a QR code data URL from an otpauth:// URI.
 * The returned string can be used directly as an <img src> value.
 */
export async function generateQrCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/**
 * Verifies a TOTP token against a base32-encoded secret.
 * Allows a window of ±1 period (30 seconds) for clock drift.
 */
export function verifyTotp(secret: string, token: string): boolean {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  return totp.validate({ token, window: 1 }) !== null;
}
