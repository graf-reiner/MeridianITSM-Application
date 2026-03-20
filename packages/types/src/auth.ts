import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Extended login schema that includes tenantSlug for tenant resolution at login time.
// The login route uses this schema since we don't have a JWT yet to extract tenantId from.
export const loginWithTenantSchema = loginSchema.extend({
  tenantSlug: z.string().min(2).max(50),
});
export type LoginWithTenantInput = z.infer<typeof loginWithTenantSchema>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

export const jwtPayloadSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  roles: z.array(z.string()),
  type: z.enum(['access', 'refresh']).default('access'),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()),
  rateLimit: z.number().int().min(1).max(10000).default(100),
  expiresAt: z.string().datetime().optional(),
});

// Owner admin auth schemas (separate from tenant auth)
export const ownerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type OwnerLoginInput = z.infer<typeof ownerLoginSchema>;

export const ownerJwtPayloadSchema = z.object({
  ownerUserId: z.string().uuid(),
  email: z.string().email(),
  type: z.enum(['access', 'refresh']).default('access'),
});
export type OwnerJwtPayload = z.infer<typeof ownerJwtPayloadSchema>;
