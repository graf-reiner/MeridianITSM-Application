import { prisma } from '@meridian/db';

/**
 * Re-export the shared Prisma client for SSO route handlers.
 * These routes need direct DB access because they execute before
 * authentication (the user hasn't logged in yet).
 */
export const ssoPrisma = prisma;
