import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../../../lib/owner-auth';
import { retryInvoice } from '../../../../../lib/stripe-admin';
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STRIPE_API_VERSION = '2026-02-25.acacia' as any;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyOwnerToken(token);
    if (payload.type !== 'access') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { tenantId } = await params;

  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { name: true } } },
  });

  if (!subscription) {
    return NextResponse.json({ error: 'Tenant subscription not found' }, { status: 404 });
  }

  if (!subscription.stripeCustomerId) {
    return NextResponse.json({ error: 'Tenant has no Stripe customer ID' }, { status: 400 });
  }

  // Fetch latest open invoice for this customer
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
  const invoices = await stripe.invoices.list({
    customer: subscription.stripeCustomerId,
    status: 'open',
    limit: 1,
  });

  if (invoices.data.length === 0) {
    return NextResponse.json({ error: 'No open invoices found for this tenant' }, { status: 404 });
  }

  const invoice = invoices.data[0];

  try {
    const paid = await retryInvoice(invoice.id);
    return NextResponse.json({
      success: true,
      invoiceId: paid.id,
      newStatus: paid.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retry invoice';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
