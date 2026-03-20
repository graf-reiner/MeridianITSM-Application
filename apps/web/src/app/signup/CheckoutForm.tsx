'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutFormProps {
  priceId: string;
  onBack: () => void;
}

/**
 * Inner form component that uses Stripe hooks.
 * Must be rendered inside an <Elements> provider.
 */
function InnerCheckoutForm({ priceId, onBack }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Validate Elements before creating the intent
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message ?? 'Payment validation failed');
      setIsLoading(false);
      return;
    }

    // Create the subscription and get the client secret via deferred intent
    let clientSecret: string;
    try {
      const res = await fetch('/api/v1/billing/create-checkout-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Failed to create checkout intent');
      }

      const data = (await res.json()) as { clientSecret: string };
      clientSecret = data.clientSecret;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsLoading(false);
      return;
    }

    // Confirm the payment via Stripe Elements — redirects to /billing/success on success
    const { error } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/billing/success`,
      },
    });

    // If we reach here, confirmPayment failed (redirect didn't happen)
    if (error) {
      setErrorMessage(error.message ?? 'Payment confirmation failed');
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480, margin: '0 auto' }}>
      <PaymentElement />

      {errorMessage && (
        <p style={{ color: '#dc2626', marginTop: 12, fontSize: 14 }}>{errorMessage}</p>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          style={{ flex: 1, padding: '10px 16px', cursor: 'pointer' }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || isLoading}
          style={{
            flex: 2,
            padding: '10px 16px',
            backgroundColor: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? 'Processing...' : 'Subscribe'}
        </button>
      </div>
    </form>
  );
}

/**
 * SubscribeFlow wraps InnerCheckoutForm with the Stripe Elements provider.
 * amount is in cents (e.g., 2900 for $29.00).
 */
export function SubscribeFlow({
  priceId,
  amount,
  onBack,
}: {
  priceId: string;
  amount: number;
  onBack: () => void;
}) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: 'subscription',
        amount,
        currency: 'usd',
      }}
    >
      <InnerCheckoutForm priceId={priceId} onBack={onBack} />
    </Elements>
  );
}
