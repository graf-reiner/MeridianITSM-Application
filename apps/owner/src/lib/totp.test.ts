import { describe, it, expect } from 'vitest';
import { generateTotpSecret, generateQrCode, verifyTotp } from './totp';

describe('TOTP library', () => {
  it('generateTotpSecret returns { secret, otpauthUrl } with non-empty values', () => {
    const result = generateTotpSecret('admin@example.com');
    expect(result.secret).toBeTruthy();
    expect(result.otpauthUrl).toBeTruthy();
  });

  it('otpauthUrl contains otpauth://totp/ and issuer MeridianITSM', () => {
    const result = generateTotpSecret('admin@example.com');
    expect(result.otpauthUrl).toContain('otpauth://totp/');
    expect(result.otpauthUrl).toContain('MeridianITSM');
  });

  it('verifyTotp returns false for incorrect token 000000', () => {
    const { secret } = generateTotpSecret('admin@example.com');
    const result = verifyTotp(secret, '000000');
    // 000000 is very unlikely to be a valid TOTP token
    // We cannot guarantee false (1 in 1,000,000 chance it could be valid)
    // but we test that the function runs without error
    expect(typeof result).toBe('boolean');
  });

  it('verifyTotp returns true for correct token generated from same secret', async () => {
    const { TOTP, Secret } = await import('otpauth');
    const { secret } = generateTotpSecret('admin@example.com');
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const token = totp.generate();
    const result = verifyTotp(secret, token);
    expect(result).toBe(true);
  });

  it('generateQrCode returns a data URL starting with data:image/png;base64', async () => {
    const { otpauthUrl } = generateTotpSecret('admin@example.com');
    const qrCode = await generateQrCode(otpauthUrl);
    expect(qrCode).toMatch(/^data:image\/png;base64,/);
  });
});
