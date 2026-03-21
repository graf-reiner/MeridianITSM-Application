import Stripe from 'stripe';

// Lazy-initialized Stripe SDK client — avoids crash when STRIPE_SECRET_KEY is not set (dev mode)
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set — Stripe operations are unavailable');
    }
    _stripe = new Stripe(key, { apiVersion: '2026-02-25.clover' as any });
  }
  return _stripe;
}

/** @deprecated Use getStripe() for lazy init. Kept for backward compatibility. */
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' as any })
  : (null as unknown as Stripe);

// SubscriptionStatus enum values (mirrors Prisma enum)
export type SubscriptionStatusValue = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

// SubscriptionPlanTier enum values (mirrors Prisma enum)
export type SubscriptionPlanTierValue = 'STARTER' | 'PROFESSIONAL' | 'BUSINESS' | 'ENTERPRISE';

/**
 * Maps a Stripe subscription status string to our internal SubscriptionStatus enum value.
 */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatusValue {
  switch (stripeStatus) {
    case 'active':
      return 'ACTIVE';
    case 'trialing':
      return 'TRIALING';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'CANCELED';
    default:
      return 'SUSPENDED';
  }
}

/**
 * Returns the next subscription tier up from the current tier.
 * ENTERPRISE is the highest tier and returns itself.
 */
export function getUpgradeTier(currentTier: SubscriptionPlanTierValue): SubscriptionPlanTierValue {
  switch (currentTier) {
    case 'STARTER':
      return 'PROFESSIONAL';
    case 'PROFESSIONAL':
      return 'BUSINESS';
    case 'BUSINESS':
      return 'ENTERPRISE';
    case 'ENTERPRISE':
      return 'ENTERPRISE';
  }
}
