import type { FastifyInstance } from 'fastify';
import { getDashboardStats } from '../../../services/report.service.js';

/**
 * Dashboard stats endpoint.
 *
 * GET /api/v1/dashboard — Returns aggregate ticket stats, volume charts,
 * top categories, recent activity, and SLA overdue count.
 *
 * Covers: REPT-01
 */
export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── GET /api/v1/dashboard ────────────────────────────────────────────────

  fastify.get('/api/v1/dashboard', async (request) => {
    const user = request.user as { tenantId: string; userId: string };
    const { tenantId } = user;

    const stats = await getDashboardStats(tenantId);
    return stats;
  });
}
