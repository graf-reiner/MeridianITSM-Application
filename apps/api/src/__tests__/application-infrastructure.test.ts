import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted prisma mock
// ---------------------------------------------------------------------------

const { mockPrismaObj } = vi.hoisted(() => {
  return { mockPrismaObj: {} as Record<string, any> };
});

const prismaApplicationFindFirst = vi.fn();
const prismaCmdbConfigurationItemFindFirst = vi.fn();
const prismaCmdbConfigurationItemFindMany = vi.fn();
const prismaCmdbRelationshipFindMany = vi.fn();
const prismaCmdbCiApplicationFindMany = vi.fn();
const prismaApplicationFindMany = vi.fn();
const prismaCmdbCiEndpointFindMany = vi.fn();

Object.assign(mockPrismaObj, {
  application: {
    findFirst: prismaApplicationFindFirst,
    findMany: prismaApplicationFindMany,
  },
  cmdbConfigurationItem: {
    findFirst: prismaCmdbConfigurationItemFindFirst,
    findMany: prismaCmdbConfigurationItemFindMany,
  },
  cmdbRelationship: {
    findMany: prismaCmdbRelationshipFindMany,
  },
  cmdbCiApplication: {
    findMany: prismaCmdbCiApplicationFindMany,
  },
  cmdbCiEndpoint: {
    findMany: prismaCmdbCiEndpointFindMany,
  },
});

vi.mock('@meridian/db', () => ({ prisma: mockPrismaObj }));

import {
  getApplicationInfrastructure,
  getApplicationSslCertificates,
  certStatusFor,
} from '../services/application.service.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const APP_ID = '00000000-0000-0000-0000-app000000001';
const PRIMARY_CI = '00000000-0000-0000-0000-ci0000000001';
const SERVER_CI = '00000000-0000-0000-0000-ci0000000002';
const ENDPOINT_CI = '00000000-0000-0000-0000-ci0000000003';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('certStatusFor', () => {
  it('returns null for null input (no expiry data)', () => {
    expect(certStatusFor(null)).toBeNull();
  });

  it('classifies expired certs', () => {
    expect(certStatusFor(-1)).toBe('EXPIRED');
    expect(certStatusFor(-100)).toBe('EXPIRED');
  });

  it('classifies critical (<7 days)', () => {
    expect(certStatusFor(0)).toBe('CRITICAL');
    expect(certStatusFor(6)).toBe('CRITICAL');
  });

  it('classifies warning (7..29 days)', () => {
    expect(certStatusFor(7)).toBe('WARNING');
    expect(certStatusFor(29)).toBe('WARNING');
  });

  it('classifies notice (30..59 days)', () => {
    expect(certStatusFor(30)).toBe('NOTICE');
    expect(certStatusFor(59)).toBe('NOTICE');
  });

  it('classifies ok (>=60 days)', () => {
    expect(certStatusFor(60)).toBe('OK');
    expect(certStatusFor(365)).toBe('OK');
  });
});

describe('getApplicationInfrastructure', () => {
  it('returns null when application does not exist in tenant', async () => {
    prismaApplicationFindFirst.mockResolvedValue(null);

    const result = await getApplicationInfrastructure(TENANT_ID, APP_ID);

    expect(result).toBeNull();
    expect(prismaApplicationFindFirst).toHaveBeenCalledWith({
      where: { id: APP_ID, tenantId: TENANT_ID },
      select: { id: true, primaryCiId: true },
    });
  });

  it('returns empty composite when application has no primary CI', async () => {
    prismaApplicationFindFirst.mockResolvedValue({ id: APP_ID, primaryCiId: null });

    const result = await getApplicationInfrastructure(TENANT_ID, APP_ID);

    expect(result).toEqual({
      primaryCi: null,
      cisByClass: {},
      endpoints: [],
      networkPorts: [],
      environments: [],
    });
    // Should not have walked relationships
    expect(prismaCmdbRelationshipFindMany).not.toHaveBeenCalled();
  });

  it('walks relationships in BOTH directions and groups CIs by class', async () => {
    prismaApplicationFindFirst.mockResolvedValue({ id: APP_ID, primaryCiId: PRIMARY_CI });

    prismaCmdbConfigurationItemFindFirst.mockResolvedValue({
      id: PRIMARY_CI,
      ciNumber: 1,
      name: 'Acme Portal',
      ciClass: { classKey: 'application_instance', className: 'Application Instance' },
      businessOwner: null,
      technicalOwner: null,
      supportGroup: null,
    });

    prismaCmdbRelationshipFindMany.mockResolvedValue([
      { sourceId: PRIMARY_CI, targetId: SERVER_CI, relationshipType: 'runs_on' },
      { sourceId: ENDPOINT_CI, targetId: PRIMARY_CI, relationshipType: 'has_endpoint' },
    ]);

    prismaCmdbConfigurationItemFindMany.mockResolvedValue([
      {
        id: SERVER_CI,
        ciNumber: 2,
        name: 'web-01',
        status: 'ACTIVE',
        hostname: 'web-01.acme.local',
        ipAddress: '10.0.0.5',
        ciClass: { classKey: 'server', className: 'Server' },
        cmdbEnvironment: { id: 'env-prod', envKey: 'prod', envName: 'Production' },
        serverExt: {
          operatingSystem: 'Ubuntu',
          osVersion: '22.04',
          cpuCount: 4,
          memoryGb: 16,
          virtualizationPlatform: 'VMware',
        },
        databaseExt: null,
        cloudResourceExt: null,
        networkDeviceExt: null,
        endpointExt: null,
      },
      {
        id: ENDPOINT_CI,
        ciNumber: 3,
        name: 'portal.acme.com',
        status: 'ACTIVE',
        hostname: null,
        ipAddress: null,
        ciClass: { classKey: 'endpoint', className: 'Endpoint' },
        cmdbEnvironment: null,
        serverExt: null,
        databaseExt: null,
        cloudResourceExt: null,
        networkDeviceExt: null,
        endpointExt: {
          endpointType: 'https',
          protocol: 'tcp',
          port: 443,
          url: 'https://portal.acme.com',
          dnsName: 'portal.acme.com',
          tlsRequired: true,
          certificateExpiryDate: new Date(Date.now() + 10 * 86400000),
          certificateIssuer: "Let's Encrypt R3",
        },
      },
    ]);

    prismaCmdbCiApplicationFindMany.mockResolvedValue([
      {
        ci: {
          id: PRIMARY_CI,
          name: 'Acme Portal',
          cmdbEnvironment: { id: 'env-prod', envKey: 'prod', envName: 'Production' },
        },
      },
    ]);

    const result = await getApplicationInfrastructure(TENANT_ID, APP_ID);

    expect(result).not.toBeNull();
    expect(result!.primaryCi?.id).toBe(PRIMARY_CI);
    expect(Object.keys(result!.cisByClass).sort()).toEqual(['endpoint', 'server']);
    expect(result!.cisByClass['server']).toHaveLength(1);
    expect(result!.cisByClass['server'][0].server?.osType).toBe('Ubuntu');
    expect(result!.cisByClass['server'][0].server?.isVirtual).toBe(true);
    expect(result!.cisByClass['server'][0].relationship.direction).toBe('outgoing');
    expect(result!.cisByClass['endpoint'][0].relationship.direction).toBe('incoming');

    expect(result!.endpoints).toHaveLength(1);
    expect(result!.endpoints[0].daysUntilExpiry).toBeGreaterThan(0);
    expect(result!.endpoints[0].daysUntilExpiry).toBeLessThanOrEqual(10);
    expect(result!.endpoints[0].status).toBe('WARNING');

    // Network ports flat list pulls from endpoint CI port=443 and from
    // server hostname (no, server isn't included). Just check endpoint port:
    const ports = result!.networkPorts.filter((p) => p.source === 'endpoint');
    expect(ports).toHaveLength(1);
    expect(ports[0].port).toBe(443);
    expect(ports[0].protocol).toBe('tcp');

    expect(result!.environments).toHaveLength(1);
    expect(result!.environments[0].envKey).toBe('prod');

    // Tenant isolation: every prisma call must have included tenantId
    const callArgs = [
      prismaApplicationFindFirst.mock.calls[0][0],
      prismaCmdbConfigurationItemFindFirst.mock.calls[0][0],
      prismaCmdbRelationshipFindMany.mock.calls[0][0],
      prismaCmdbConfigurationItemFindMany.mock.calls[0][0],
      prismaCmdbCiApplicationFindMany.mock.calls[0][0],
    ];
    for (const call of callArgs) {
      const where = call.where;
      // tenantId may be at top level or nested in OR; verify presence
      expect(JSON.stringify(where)).toContain(TENANT_ID);
    }
  });

  it('handles empty relationships gracefully (CI with no neighbors)', async () => {
    prismaApplicationFindFirst.mockResolvedValue({ id: APP_ID, primaryCiId: PRIMARY_CI });
    prismaCmdbConfigurationItemFindFirst.mockResolvedValue({
      id: PRIMARY_CI,
      ciNumber: 1,
      name: 'Lone App',
      ciClass: { classKey: 'application_instance', className: 'Application Instance' },
      businessOwner: null,
      technicalOwner: null,
      supportGroup: null,
    });
    prismaCmdbRelationshipFindMany.mockResolvedValue([]);
    prismaCmdbCiApplicationFindMany.mockResolvedValue([]);

    const result = await getApplicationInfrastructure(TENANT_ID, APP_ID);

    expect(result!.primaryCi).not.toBeNull();
    expect(result!.cisByClass).toEqual({});
    expect(result!.endpoints).toEqual([]);
    expect(result!.networkPorts).toEqual([]);
    // Should NOT have called findMany for related CIs (early return on empty set)
    expect(prismaCmdbConfigurationItemFindMany).not.toHaveBeenCalled();
  });
});

describe('getApplicationSslCertificates', () => {
  it('returns empty list when no apps have a primary CI', async () => {
    prismaApplicationFindMany.mockResolvedValue([]);

    const result = await getApplicationSslCertificates(TENANT_ID);

    expect(result).toEqual([]);
    expect(prismaApplicationFindMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, primaryCiId: { not: null } },
      select: { id: true, name: true, primaryCiId: true },
    });
  });

  it('aggregates certs across applications and sorts by daysUntilExpiry ascending', async () => {
    prismaApplicationFindMany.mockResolvedValue([
      { id: 'app-1', name: 'Portal', primaryCiId: 'ci-1' },
      { id: 'app-2', name: 'Admin', primaryCiId: 'ci-2' },
    ]);
    // Both apps walk relationships
    prismaCmdbRelationshipFindMany.mockImplementation(({ where }: any) => {
      const id = where.OR[0].sourceId;
      if (id === 'ci-1') return Promise.resolve([{ sourceId: 'ci-1', targetId: 'ep-1' }]);
      if (id === 'ci-2') return Promise.resolve([{ sourceId: 'ci-2', targetId: 'ep-2' }]);
      return Promise.resolve([]);
    });
    prismaCmdbCiEndpointFindMany.mockImplementation(({ where }: any) => {
      const ids = where.ciId.in;
      if (ids.includes('ep-1')) {
        return Promise.resolve([
          {
            url: 'https://portal',
            certificateExpiryDate: new Date(Date.now() + 50 * 86400000),
            certificateIssuer: 'CA1',
            ci: { id: 'ep-1', name: 'portal-cert', isDeleted: false },
          },
        ]);
      }
      if (ids.includes('ep-2')) {
        return Promise.resolve([
          {
            url: 'https://admin',
            certificateExpiryDate: new Date(Date.now() + 5 * 86400000),
            certificateIssuer: 'CA2',
            ci: { id: 'ep-2', name: 'admin-cert', isDeleted: false },
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await getApplicationSslCertificates(TENANT_ID);

    expect(result).toHaveLength(2);
    // Sorted ASC — admin (5 days) before portal (50 days)
    expect(result[0].applicationName).toBe('Admin');
    expect(result[0].status).toBe('CRITICAL');
    expect(result[1].applicationName).toBe('Portal');
    expect(result[1].status).toBe('NOTICE');
  });

  it('skips deleted endpoint CIs', async () => {
    prismaApplicationFindMany.mockResolvedValue([
      { id: 'app-1', name: 'Portal', primaryCiId: 'ci-1' },
    ]);
    prismaCmdbRelationshipFindMany.mockResolvedValue([
      { sourceId: 'ci-1', targetId: 'ep-1' },
    ]);
    prismaCmdbCiEndpointFindMany.mockResolvedValue([
      {
        url: 'https://x',
        certificateExpiryDate: new Date(Date.now() + 5 * 86400000),
        certificateIssuer: 'CA',
        ci: { id: 'ep-1', name: 'x', isDeleted: true },
      },
    ]);

    const result = await getApplicationSslCertificates(TENANT_ID);
    expect(result).toEqual([]);
  });
});
