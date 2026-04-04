/**
 * Safely serialize data for JSON responses.
 * Converts BigInt values (from Prisma count/aggregate) to Number,
 * and handles Decimal objects.
 *
 * Returns a Response object directly to avoid NextResponse.json()
 * hitting BigInt during its own JSON.stringify call.
 */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  // Prisma Decimal objects have a toNumber() method
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return value;
}

export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, replacer)) as T;
}

/**
 * Create a JSON Response that safely handles BigInt/Decimal values.
 * Use this instead of NextResponse.json() for Prisma data.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  const body = JSON.stringify(data, replacer);
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
