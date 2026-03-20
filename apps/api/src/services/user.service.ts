import { prisma } from '@meridian/db';

/**
 * Find a user by ID within a specific tenant.
 * Returns the user with their role slugs, or null if not found.
 */
export async function findById(userId: string, tenantId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) return null;

  const roles = user.userRoles.map((ur) => ur.role.slug);
  return { ...user, roles };
}

/**
 * Find a user by email within a specific tenant.
 * Returns the user with their role slugs, or null if not found.
 */
export async function findByEmail(email: string, tenantId: string) {
  const user = await prisma.user.findFirst({
    where: { email, tenantId },
    include: {
      userRoles: {
        include: {
          role: true,
        },
      },
    },
  });

  if (!user) return null;

  const roles = user.userRoles.map((ur) => ur.role.slug);
  return { ...user, roles };
}
