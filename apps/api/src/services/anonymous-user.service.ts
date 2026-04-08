import { prisma } from '@meridian/db';

/**
 * Find or create a user from an email address for anonymous form submissions.
 * If a user with that email exists in the tenant, returns their ID.
 * Otherwise creates a new user with end_user role and an unhashable password.
 */
export async function findOrCreateAnonymousUser(
  tenantId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  // Normalize
  const normalizedEmail = email.toLowerCase().trim();
  const trimmedFirst = firstName.trim();
  const trimmedLast = lastName.trim();

  // Try to find existing user
  const existing = await prisma.user.findFirst({
    where: { tenantId, email: normalizedEmail },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Find the end_user role for this tenant
  const endUserRole = await prisma.role.findFirst({
    where: { tenantId, slug: 'end_user' },
    select: { id: true },
  });

  try {
    // Create new user with unhashable password (bcrypt will never match this)
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: normalizedEmail,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        passwordHash: 'ANONYMOUS_NO_LOGIN',
        status: 'ACTIVE',
        ...(endUserRole ? {
          userRoles: {
            create: {
              tenantId,
              roleId: endUserRole.id,
            },
          },
        } : {}),
      },
      select: { id: true },
    });

    return user.id;
  } catch (err: unknown) {
    // Handle race condition: unique constraint violation on [tenantId, email]
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2002') {
      const retried = await prisma.user.findFirst({
        where: { tenantId, email: normalizedEmail },
        select: { id: true },
      });
      if (retried) return retried.id;
    }
    throw err;
  }
}
