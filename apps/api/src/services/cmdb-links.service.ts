import { prisma } from '@meridian/db';

// ─── Change Links (CmdbChangeLink) ──────────────────────────────────────────

export async function createChangeLink(
  tenantId: string,
  ciId: string,
  changeId: string,
  impactRole?: string,
) {
  const ci = await prisma.cmdbConfigurationItem.findFirst({
    where: { id: ciId, tenantId, isDeleted: false },
  });
  if (!ci) throw new Error('Configuration item not found');

  const change = await prisma.change.findFirst({
    where: { id: changeId, tenantId },
  });
  if (!change) throw new Error('Change not found');

  return prisma.cmdbChangeLink.create({
    data: {
      tenantId,
      ciId,
      changeId,
      impactRole: impactRole ?? null,
    },
    include: {
      ci: {
        select: {
          id: true,
          ciNumber: true,
          name: true,
          classId: true,
          hostname: true,
          criticality: true,
        },
      },
      change: {
        select: {
          id: true,
          changeNumber: true,
          title: true,
          type: true,
          status: true,
          scheduledStart: true,
        },
      },
    },
  });
}

export async function deleteChangeLink(
  tenantId: string,
  ciId: string,
  changeId: string,
) {
  const link = await prisma.cmdbChangeLink.findFirst({
    where: { ciId, changeId, tenantId },
  });
  if (!link) throw new Error('Change link not found');

  return prisma.cmdbChangeLink.delete({
    where: { id: link.id },
  });
}

export async function listChangeLinks(tenantId: string, ciId: string) {
  return prisma.cmdbChangeLink.findMany({
    where: { tenantId, ciId },
    include: {
      change: {
        select: {
          id: true,
          changeNumber: true,
          title: true,
          type: true,
          status: true,
          scheduledStart: true,
          createdAt: true,
        },
      },
    },
    orderBy: { change: { createdAt: 'desc' } },
  });
}

export async function listCIsByChange(tenantId: string, changeId: string) {
  return prisma.cmdbChangeLink.findMany({
    where: { tenantId, changeId },
    include: {
      ci: {
        select: {
          id: true,
          ciNumber: true,
          name: true,
          classId: true,
          hostname: true,
          criticality: true,
        },
      },
    },
    orderBy: { ci: { name: 'asc' } },
  });
}

// ─── Incident Links (CmdbIncidentLink) ──────────────────────────────────────

export async function createIncidentLink(
  tenantId: string,
  ciId: string,
  ticketId: string,
  impactRole?: string,
) {
  const ci = await prisma.cmdbConfigurationItem.findFirst({
    where: { id: ciId, tenantId, isDeleted: false },
  });
  if (!ci) throw new Error('Configuration item not found');

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
  });
  if (!ticket) throw new Error('Ticket not found');

  return prisma.cmdbIncidentLink.create({
    data: {
      tenantId,
      ciId,
      ticketId,
      impactRole: impactRole ?? null,
    },
    include: {
      ci: {
        select: {
          id: true,
          ciNumber: true,
          name: true,
          classId: true,
          hostname: true,
          criticality: true,
        },
      },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
        },
      },
    },
  });
}

export async function deleteIncidentLink(
  tenantId: string,
  ciId: string,
  ticketId: string,
) {
  const link = await prisma.cmdbIncidentLink.findFirst({
    where: { ciId, ticketId, tenantId },
  });
  if (!link) throw new Error('Incident link not found');

  return prisma.cmdbIncidentLink.delete({
    where: { id: link.id },
  });
}

export async function listIncidentLinks(tenantId: string, ciId: string) {
  return prisma.cmdbIncidentLink.findMany({
    where: { tenantId, ciId },
    include: {
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: { ticket: { createdAt: 'desc' } },
  });
}

// ─── Problem Links (CmdbProblemLink) ────────────────────────────────────────

export async function createProblemLink(
  tenantId: string,
  ciId: string,
  ticketId: string,
  impactRole?: string,
) {
  const ci = await prisma.cmdbConfigurationItem.findFirst({
    where: { id: ciId, tenantId, isDeleted: false },
  });
  if (!ci) throw new Error('Configuration item not found');

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, tenantId },
  });
  if (!ticket) throw new Error('Ticket not found');

  return prisma.cmdbProblemLink.create({
    data: {
      tenantId,
      ciId,
      ticketId,
      impactRole: impactRole ?? null,
    },
    include: {
      ci: {
        select: {
          id: true,
          ciNumber: true,
          name: true,
          classId: true,
          hostname: true,
          criticality: true,
        },
      },
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
        },
      },
    },
  });
}

export async function deleteProblemLink(
  tenantId: string,
  ciId: string,
  ticketId: string,
) {
  const link = await prisma.cmdbProblemLink.findFirst({
    where: { ciId, ticketId, tenantId },
  });
  if (!link) throw new Error('Problem link not found');

  return prisma.cmdbProblemLink.delete({
    where: { id: link.id },
  });
}

export async function listProblemLinks(tenantId: string, ciId: string) {
  return prisma.cmdbProblemLink.findMany({
    where: { tenantId, ciId },
    include: {
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          priority: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: { ticket: { createdAt: 'desc' } },
  });
}

/**
 * List all CIs linked to a ticket (both incident and problem links).
 */
export async function listCIsByTicket(tenantId: string, ticketId: string) {
  const ciSelect = {
    id: true,
    ciNumber: true,
    name: true,
    hostname: true,
    criticality: true,
    type: true,
    status: true,
    ciClass: { select: { id: true, classKey: true, className: true, icon: true } },
    lifecycleStatus: { select: { id: true, statusKey: true, statusName: true } },
  };

  const [incidentLinks, problemLinks] = await Promise.all([
    prisma.cmdbIncidentLink.findMany({
      where: { tenantId, ticketId },
      include: { ci: { select: ciSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.cmdbProblemLink.findMany({
      where: { tenantId, ticketId },
      include: { ci: { select: ciSelect } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return { incidents: incidentLinks, problems: problemLinks };
}
