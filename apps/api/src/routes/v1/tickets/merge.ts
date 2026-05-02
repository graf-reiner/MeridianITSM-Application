import type { FastifyInstance } from 'fastify';
import { prisma } from '@meridian/db';
import { formatTicketNumber } from '@meridian/core';

/**
 * Ticket Merge REST API routes.
 *
 * POST /api/v1/tickets/:id/merge — Merge source tickets into this target ticket
 *
 * When merging:
 *   1. All comments from source tickets are re-parented to the target
 *   2. All attachments from source tickets are re-parented to the target
 *   3. All watchers from source tickets are added to the target (deduped)
 *   4. Source tickets are marked CLOSED with mergedIntoId pointing to target
 *   5. Activity entries are created on all affected tickets
 */
export async function ticketMergeRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post('/api/v1/tickets/:id/merge', async (request, reply) => {
    const user = request.user as { userId: string; tenantId: string; roles: string[] };
    const { id: targetId } = request.params as { id: string };
    const { sourceTicketIds } = request.body as { sourceTicketIds: string[] };

    if (!sourceTicketIds || !Array.isArray(sourceTicketIds) || sourceTicketIds.length === 0) {
      return reply.status(400).send({ error: 'sourceTicketIds array is required' });
    }

    if (sourceTicketIds.includes(targetId)) {
      return reply.status(400).send({ error: 'Cannot merge a ticket into itself' });
    }

    if (sourceTicketIds.length > 20) {
      return reply.status(400).send({ error: 'Maximum 20 source tickets per merge' });
    }

    // Only agents/admins can merge
    const isStaff = user.roles.some(r => ['admin', 'msp_admin', 'agent'].includes(r));
    if (!isStaff) {
      return reply.status(403).send({ error: 'Only agents and admins can merge tickets' });
    }

    // Verify target ticket
    const target = await prisma.ticket.findFirst({
      where: { id: targetId, tenantId: user.tenantId },
      select: { id: true, ticketNumber: true, title: true, status: true },
    });
    if (!target) {
      return reply.status(404).send({ error: 'Target ticket not found' });
    }
    if (target.status === 'CLOSED' || target.status === 'CANCELLED') {
      return reply.status(400).send({ error: 'Cannot merge into a closed or cancelled ticket' });
    }

    // Verify source tickets
    const sources = await prisma.ticket.findMany({
      where: { id: { in: sourceTicketIds }, tenantId: user.tenantId },
      select: { id: true, ticketNumber: true, title: true, mergedIntoId: true },
    });

    if (sources.length !== sourceTicketIds.length) {
      return reply.status(400).send({ error: 'One or more source tickets not found' });
    }

    const alreadyMerged = sources.filter(s => s.mergedIntoId);
    if (alreadyMerged.length > 0) {
      return reply.status(400).send({
        error: `Tickets already merged: ${alreadyMerged.map(t => `${formatTicketNumber(t.ticketNumber)}`).join(', ')}`,
      });
    }

    // Execute merge in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let commentsMoved = 0;
      let attachmentsMoved = 0;
      let watchersAdded = 0;

      for (const source of sources) {
        // Move comments to target
        const movedComments = await tx.ticketComment.updateMany({
          where: { ticketId: source.id, tenantId: user.tenantId },
          data: { ticketId: targetId },
        });
        commentsMoved += movedComments.count;

        // Move attachments to target
        const movedAttachments = await tx.ticketAttachment.updateMany({
          where: { ticketId: source.id, tenantId: user.tenantId },
          data: { ticketId: targetId },
        });
        attachmentsMoved += movedAttachments.count;

        // Move watchers to target (skip duplicates)
        const sourceWatchers = await tx.ticketWatcher.findMany({
          where: { ticketId: source.id, tenantId: user.tenantId },
          select: { userId: true },
        });

        for (const watcher of sourceWatchers) {
          try {
            await tx.ticketWatcher.upsert({
              where: { ticketId_userId: { ticketId: targetId, userId: watcher.userId } },
              update: {},
              create: {
                tenantId: user.tenantId,
                ticketId: targetId,
                userId: watcher.userId,
              },
            });
            watchersAdded++;
          } catch {
            // Duplicate — skip
          }
        }

        // Delete source watchers
        await tx.ticketWatcher.deleteMany({
          where: { ticketId: source.id, tenantId: user.tenantId },
        });

        // Close source ticket with merge reference
        await tx.ticket.update({
          where: { id: source.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            mergedIntoId: targetId,
            resolution: `Merged into ${formatTicketNumber(target.ticketNumber)}`,
          },
        });

        // Activity on source
        await tx.ticketActivity.create({
          data: {
            tenantId: user.tenantId,
            ticketId: source.id,
            actorId: user.userId,
            activityType: 'MERGED',
            metadata: {
              mergedIntoTicketId: targetId,
              mergedIntoTicketNumber: target.ticketNumber,
            },
          },
        });
      }

      // Activity on target
      await tx.ticketActivity.create({
        data: {
          tenantId: user.tenantId,
          ticketId: targetId,
          actorId: user.userId,
          activityType: 'MERGE_RECEIVED',
          metadata: {
            mergedTicketIds: sources.map(s => s.id),
            mergedTicketNumbers: sources.map(s => s.ticketNumber),
            commentsMoved,
            attachmentsMoved,
            watchersAdded,
          },
        },
      });

      return { commentsMoved, attachmentsMoved, watchersAdded, sourcesClosed: sources.length };
    });

    return reply.status(200).send({
      success: true,
      targetTicketId: targetId,
      targetTicketNumber: target.ticketNumber,
      ...result,
    });
  });
}
