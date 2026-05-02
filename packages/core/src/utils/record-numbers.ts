// ─── Record number formatting ────────────────────────────────────────────────
// Single source of truth for the human-facing record number prefixes.
// Tickets render as SR-##### (Service Request); changes render as CR-#####
// (Change Request). 5-digit zero-pad for both. Update PREFIX_TICKET / PREFIX_CHANGE
// here to rebrand — every consumer in the monorepo calls these helpers.

const PAD_WIDTH = 5;

const PREFIX_TICKET = 'SR';
const PREFIX_CHANGE = 'CR';
const PREFIX_PROBLEM = 'PRB';

// Accept number or string — Prisma `Int` columns surface as `number`, but JSON
// payloads (web client, API responses cast through `as any`) sometimes round-trip
// the value as a string. Either is fine to pad.
type RecordNumber = number | string | null | undefined;

export function formatTicketNumber(ticketNumber: RecordNumber): string {
  if (ticketNumber == null || ticketNumber === '') return '';
  return `${PREFIX_TICKET}-${String(ticketNumber).padStart(PAD_WIDTH, '0')}`;
}

export function formatChangeNumber(changeNumber: RecordNumber): string {
  if (changeNumber == null || changeNumber === '') return '';
  return `${PREFIX_CHANGE}-${String(changeNumber).padStart(PAD_WIDTH, '0')}`;
}

export function formatProblemNumber(ticketNumber: RecordNumber): string {
  if (ticketNumber == null || ticketNumber === '') return '';
  return `${PREFIX_PROBLEM}-${String(ticketNumber).padStart(PAD_WIDTH, '0')}`;
}

/**
 * Regex used by the email-inbound worker to recognize a reply-thread reference
 * in a subject line. Accepts both the legacy `TKT-` prefix (so in-flight
 * reply threads keep working) and the current `SR-` prefix.
 */
export const TICKET_NUMBER_SUBJECT_REGEX = /(?:TKT|SR)-(\d{5})/i;
