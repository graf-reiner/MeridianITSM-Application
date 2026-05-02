// Mirror of packages/core/src/utils/record-numbers.ts (mobile cannot import
// workspace packages through Metro without extra config). Keep prefixes /
// padding aligned with the source of truth.

export function formatTicketNumber(ticketNumber: number | null | undefined): string {
  if (ticketNumber == null) return '';
  return `SR-${String(ticketNumber).padStart(5, '0')}`;
}

export function formatChangeNumber(changeNumber: number | null | undefined): string {
  if (changeNumber == null) return '';
  return `CR-${String(changeNumber).padStart(5, '0')}`;
}

export function formatProblemNumber(ticketNumber: number | null | undefined): string {
  if (ticketNumber == null) return '';
  return `PRB-${String(ticketNumber).padStart(5, '0')}`;
}
