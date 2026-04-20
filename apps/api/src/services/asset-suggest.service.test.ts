import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Asset Suggest Service Test
 *
 * Covers the merge + sort logic that combines tenant DB values
 * with a hardcoded seed list for asset form autocomplete.
 */

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

import { getAssetSuggestions } from './asset-suggest.service.js';

const TENANT_A = '00000000-0000-0000-0000-000000000001';
const TENANT_B = '00000000-0000-0000-0000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAssetSuggestions', () => {
  describe('manufacturer', () => {
    it('returns DB values sorted by count desc', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'Dell', count: 47 },
        { value: 'HP', count: 12 },
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'manufacturer',
        q: '',
      });

      expect(result[0]).toEqual({ value: 'Dell', source: 'db', count: 47 });
      expect(result[1]).toEqual({ value: 'HP', source: 'db', count: 12 });
    });

    it('merges seed entries after DB entries and marks source=seed', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'Dell', count: 47 },
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'manufacturer',
        q: '',
      });

      expect(result[0]).toEqual({ value: 'Dell', source: 'db', count: 47 });
      const sources = result.map((s) => s.source);
      expect(sources.slice(1).every((s) => s === 'seed')).toBe(true);
    });

    it('dedupes seed entries that match DB entries case-insensitively', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'dell', count: 5 },
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'manufacturer',
        q: '',
      });

      const dellEntries = result.filter((s) => s.value.toLowerCase() === 'dell');
      expect(dellEntries).toHaveLength(1);
      expect(dellEntries[0]!.source).toBe('db');
    });

    it('filters seeds by case-insensitive substring match on q', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'manufacturer',
        q: 'del',
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every((s) => s.value.toLowerCase().includes('del'))).toBe(true);
    });

    it('caps output at 10 entries', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({ value: `Vendor${i}`, count: 20 - i })),
      );

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'manufacturer',
        q: '',
      });

      expect(result).toHaveLength(10);
    });

    it('passes tenantId into raw query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await getAssetSuggestions(mockPrisma as any, TENANT_B, {
        field: 'manufacturer',
        q: 'x',
      });

      const call = mockPrisma.$queryRaw.mock.calls[0];
      const joined = JSON.stringify(call);
      expect(joined).toContain(TENANT_B);
      expect(joined).not.toContain(TENANT_A);
    });
  });

  describe('model', () => {
    it('returns DB model values', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'Latitude 7440', count: 10 },
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'model',
        q: 'La',
      });

      expect(result[0]).toMatchObject({ value: 'Latitude 7440', source: 'db' });
    });

    it('passes parent filter into query when provided', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'model',
        q: '',
        parent: 'Dell',
      });

      const joined = JSON.stringify(mockPrisma.$queryRaw.mock.calls[0]);
      expect(joined).toContain('Dell');
    });

    it('filters seeds to those under the parent manufacturer', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'model',
        q: '',
        parent: 'Dell',
      });

      // Dell-specific seeds should appear; Lenovo-only seeds should not
      expect(result.some((s) => s.value === 'Latitude')).toBe(true);
      expect(result.some((s) => s.value === 'ThinkPad')).toBe(false);
    });
  });

  describe('os', () => {
    it('returns DB operating system values from CmdbCiServer', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'Ubuntu', count: 30 },
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'os',
        q: '',
      });

      expect(result[0]).toMatchObject({ value: 'Ubuntu', source: 'db', count: 30 });
    });
  });

  describe('osVersion', () => {
    it('filters seeds by parent OS', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'osVersion',
        q: '',
        parent: 'Ubuntu',
      });

      expect(result.some((s) => s.value === '22.04 LTS')).toBe(true);
      expect(result.some((s) => s.value === '23H2')).toBe(false); // Windows-only
    });
  });

  describe('cpuModel', () => {
    it('returns merged DB + seed CPU entries filtered by q', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'Intel Xeon Gold 6338', count: 4 },
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'cpuModel',
        q: 'xeon',
      });

      expect(result.every((s) => s.value.toLowerCase().includes('xeon'))).toBe(true);
      expect(result.some((s) => s.value === 'Intel Xeon Gold 6338' && s.source === 'db')).toBe(true);
    });
  });

  describe('invalid field', () => {
    it('throws on invalid field value', async () => {
      await expect(
        getAssetSuggestions(mockPrisma as any, TENANT_A, {
          field: 'bogus' as any,
          q: '',
        }),
      ).rejects.toThrow(/invalid field/i);
    });
  });

  describe('sort order', () => {
    it('places exact prefix DB matches before other DB matches', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { value: 'CoreDell', count: 100 }, // substring match on 'Del'
        { value: 'Dell', count: 50 }, // prefix match on 'Del'
      ]);

      const result = await getAssetSuggestions(mockPrisma as any, TENANT_A, {
        field: 'manufacturer',
        q: 'Del',
      });

      const dellIdx = result.findIndex((s) => s.value === 'Dell');
      const coreIdx = result.findIndex((s) => s.value === 'CoreDell');
      expect(dellIdx).toBeLessThan(coreIdx);
    });
  });
});
