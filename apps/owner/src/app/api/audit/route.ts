import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';

// Valid audit actions from the schema
const VALID_AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'ASSIGN', 'ESCALATE'] as const;
type AuditActionType = typeof VALID_AUDIT_ACTIONS[number];

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyOwnerToken(token);
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)));
  const tenantId = url.searchParams.get('tenantId') ?? undefined;
  const actionParam = url.searchParams.get('action');
  const action = (actionParam && (VALID_AUDIT_ACTIONS as readonly string[]).includes(actionParam))
    ? (actionParam as AuditActionType)
    : undefined;
  const resource = url.searchParams.get('resource') ?? undefined;
  const startDate = url.searchParams.get('startDate') ?? undefined;
  const endDate = url.searchParams.get('endDate') ?? undefined;

  // Build where clause — NOTE: intentionally NO tenantId filter by default
  // This is the ONLY endpoint with cross-tenant audit log access (owner-only capability)
  const where = {
    ...(tenantId ? { tenantId } : {}),
    ...(action ? { action } : {}),
    ...(resource ? { resource } : {}),
    ...((startDate || endDate) ? {
      createdAt: {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      },
    } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pageCount = Math.ceil(total / limit);

  return NextResponse.json({
    logs: logs.map(log => ({
      id: log.id,
      tenantId: log.tenantId,
      tenantName: log.tenant.name,
      tenantSlug: log.tenant.slug,
      userId: log.userId,
      userEmail: log.user?.email ?? null,
      userName: log.user ? `${log.user.firstName} ${log.user.lastName}` : null,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      oldData: log.oldData,
      newData: log.newData,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    })),
    total,
    page,
    pageCount,
  });
}
