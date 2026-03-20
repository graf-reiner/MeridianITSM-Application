import Stripe from 'stripe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STRIPE_API_VERSION = '2026-02-25.acacia' as any;

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
};

/**
 * Retry an open invoice payment.
 */
export async function retryInvoice(invoiceId: string): Promise<Stripe.Invoice> {
  try {
    const stripe = getStripe();
    return await stripe.invoices.pay(invoiceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to retry invoice ${invoiceId}: ${message}`);
  }
}

/**
 * List invoices for a Stripe customer (most recent 50).
 */
export async function listTenantInvoices(stripeCustomerId: string): Promise<Stripe.Invoice[]> {
  try {
    const stripe = getStripe();
    const response = await stripe.invoices.list({ customer: stripeCustomerId, limit: 50 });
    return response.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list invoices for customer ${stripeCustomerId}: ${message}`);
  }
}

/**
 * Get approximate gross revenue for the last 30 days from balance transactions.
 * Returns total in USD cents.
 */
export async function getStripeRevenue(): Promise<{ totalCents: number; periodDays: number }> {
  try {
    const stripe = getStripe();
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    let totalCents = 0;
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.BalanceTransactionListParams = {
        created: { gte: thirtyDaysAgo },
        type: 'charge',
        limit: 100,
      };
      if (startingAfter) params.starting_after = startingAfter;

      const response = await stripe.balanceTransactions.list(params);
      for (const txn of response.data) {
        if (txn.amount > 0) totalCents += txn.amount;
      }

      hasMore = response.has_more;
      if (hasMore && response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    return { totalCents, periodDays: 30 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch Stripe revenue: ${message}`);
  }
}
