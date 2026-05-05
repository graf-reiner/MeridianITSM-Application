import { describe, it, expect } from 'vitest';
import { maskHeaders, maskObject, isSensitiveKey, MASKED } from '../utils/mask-secrets.js';

describe('isSensitiveKey', () => {
  it('matches standard auth headers case-insensitively', () => {
    expect(isSensitiveKey('Authorization')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('X-API-Key')).toBe(true);
    expect(isSensitiveKey('Cookie')).toBe(true);
    expect(isSensitiveKey('X-Meridian-Signature')).toBe(true);
  });

  it('matches sensitive substrings in arbitrary names', () => {
    expect(isSensitiveKey('webhookSecret')).toBe(true);
    expect(isSensitiveKey('access_token')).toBe(true);
    expect(isSensitiveKey('userPassword')).toBe(true);
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('clientCredentials')).toBe(true);
  });

  it('lets non-sensitive names through', () => {
    expect(isSensitiveKey('Content-Type')).toBe(false);
    expect(isSensitiveKey('User-Agent')).toBe(false);
    expect(isSensitiveKey('ticketId')).toBe(false);
    expect(isSensitiveKey('')).toBe(false);
  });
});

describe('maskHeaders', () => {
  it('replaces sensitive header values with "****" while preserving casing', () => {
    const out = maskHeaders({
      'Content-Type': 'application/json',
      Authorization: 'Bearer abc.def.ghi',
      'X-Api-Key': 'sk_live_xxx',
      'User-Agent': 'meridian/1',
    });
    expect(out['Content-Type']).toBe('application/json');
    expect(out['Authorization']).toBe(MASKED);
    expect(out['X-Api-Key']).toBe(MASKED);
    expect(out['User-Agent']).toBe('meridian/1');
  });

  it('drops headers whose value is undefined', () => {
    const out = maskHeaders({ 'X-Api-Key': undefined, Allow: 'GET' });
    expect(out).toEqual({ Allow: 'GET' });
  });
});

describe('maskObject', () => {
  it('masks sensitive top-level keys, leaves the rest alone', () => {
    const out = maskObject({
      url: 'https://example.com',
      secret: 'shh',
      ticketId: 'tk1',
      password: 'p@ss',
    });
    expect(out.url).toBe('https://example.com');
    expect(out.secret).toBe(MASKED);
    expect(out.password).toBe(MASKED);
    expect(out.ticketId).toBe('tk1');
  });
});
