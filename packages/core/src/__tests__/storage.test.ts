import { describe, it, expect } from 'vitest';
import { buildStoragePath } from '../utils/storage.js';

describe('Storage Utilities', () => {
  it('buildStoragePath includes tenantId prefix', () => {
    const path = buildStoragePath('tenant-123', 'attachments', 'file.pdf');
    expect(path).toBe('tenant-123/attachments/file.pdf');
    expect(path.startsWith('tenant-123/')).toBe(true);
  });

  it('buildStoragePath with different tenants produces different paths', () => {
    const pathA = buildStoragePath('tenant-a', 'attachments', 'file.pdf');
    const pathB = buildStoragePath('tenant-b', 'attachments', 'file.pdf');
    expect(pathA).not.toBe(pathB);
  });
});
