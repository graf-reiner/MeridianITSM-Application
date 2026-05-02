// Mirror of packages/core/src/utils/record-numbers.ts (mobile cannot import
// workspace packages through Metro without extra config). Keep prefixes /
// padding aligned with the source of truth.

type RecordNumber = number | string | null | undefined;

export function formatTicketNumber(ticketNumber: RecordNumber): string {
  if (ticketNumber == null || ticketNumber === '') return '';
  return `SR-${String(ticketNumber).padStart(5, '0')}`;
}

export function formatChangeNumber(changeNumber: RecordNumber): string {
  if (changeNumber == null || changeNumber === '') return '';
  return `CR-${String(changeNumber).padStart(5, '0')}`;
}

export function formatProblemNumber(ticketNumber: RecordNumber): string {
  if (ticketNumber == null || ticketNumber === '') return '';
  return `PRB-${String(ticketNumber).padStart(5, '0')}`;
}
