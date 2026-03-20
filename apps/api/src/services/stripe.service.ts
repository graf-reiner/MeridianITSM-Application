import Stripe from 'stripe';

// Singleton Stripe SDK client
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-02-25.clover',
});

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
