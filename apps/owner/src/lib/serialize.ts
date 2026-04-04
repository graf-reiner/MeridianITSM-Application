/**
 * Safely serialize data for JSON responses.
 * Converts BigInt values (from Prisma count/aggregate) to Number,
 * and Decimal values to number strings.
 */
export function serialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  )) as T;
}
