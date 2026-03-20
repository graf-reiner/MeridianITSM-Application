import { z } from 'zod';

export const tenantTypeSchema = z.enum(['MSP', 'ENTERPRISE', 'B2C']);
export const subscriptionPlanTierSchema = z.enum([
  'STARTER',
  'PROFESSIONAL',
  'BUSINESS',
  'ENTERPRISE',
]);

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  type: tenantTypeSchema.default('MSP'),
  subdomain: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

export const tenantSettingsSchema = z
  .object({
    timezone: z.string().default('UTC'),
    dateFormat: z.string().default('YYYY-MM-DD'),
    timeFormat: z.enum(['12h', '24h']).default('24h'),
  })
  .passthrough();

export type TenantType = z.infer<typeof tenantTypeSchema>;
export type SubscriptionPlanTier = z.infer<typeof subscriptionPlanTierSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;
