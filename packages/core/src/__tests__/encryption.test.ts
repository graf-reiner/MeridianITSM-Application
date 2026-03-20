import { describe, it, expect, beforeAll } from 'vitest';

describe('AES-256-GCM Encryption', () => {
  beforeAll(() => {
    // Set test encryption key (64 hex chars = 32 bytes)
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('encrypts and decrypts to original plaintext', async () => {
    const { encrypt, decrypt } = await import('../utils/encryption.js');
    const plaintext = 'MySecretPassword123!';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const { encrypt } = await import('../utils/encryption.js');
    const plaintext = 'SameInput';
    const ct1 = encrypt(plaintext);
    const ct2 = encrypt(plaintext);
    expect(ct1).not.toBe(ct2);
  });

  it('ciphertext format is iv:tag:data', async () => {
    const { encrypt } = await import('../utils/encryption.js');
    const ct = encrypt('test');
    const parts = ct.split(':');
    expect(parts).toHaveLength(3);
  });

  it('throws on invalid ciphertext format', async () => {
    const { decrypt } = await import('../utils/encryption.js');
    expect(() => decrypt('not-valid')).toThrow();
  });
});
