import { addMinutes, addDays, startOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SlaStatusValue = 'OK' | 'WARNING' | 'CRITICAL' | 'BREACHED';

/**
 * Minimal SLA policy shape — matches the Prisma SLA model fields needed for calculations.
 */
export interface SlaPolicy {
  businessHours: boolean;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  businessDays: number[];
  timezone: string;
  autoEscalate: boolean;
  escalateToQueueId: string | null;
  p1ResponseMinutes: number;
  p1ResolutionMinutes: number;
  p2ResponseMinutes: number;
  p2ResolutionMinutes: number;
  p3ResponseMinutes: number;
  p3ResolutionMinutes: number;
  p4ResponseMinutes: number;
  p4ResolutionMinutes: number;
}

const PRIORITY_MAP: Record<Priority, { response: keyof SlaPolicy; resolution: keyof SlaPolicy }> = {
  CRITICAL: { response: 'p1ResponseMinutes', resolution: 'p1ResolutionMinutes' },
  HIGH: { response: 'p2ResponseMinutes', resolution: 'p2ResolutionMinutes' },
  MEDIUM: { response: 'p3ResponseMinutes', resolution: 'p3ResolutionMinutes' },
  LOW: { response: 'p4ResponseMinutes', resolution: 'p4ResolutionMinutes' },
};

/**
 * Returns the response target in minutes for the given priority.
 */
export function getResponseMinutes(sla: SlaPolicy, priority: Priority): number {
  return sla[PRIORITY_MAP[priority].response] as number;
}

/**
 * Returns the resolution target in minutes for the given priority.
 */
export function getResolutionMinutes(sla: SlaPolicy, priority: Priority): number {
  return sla[PRIORITY_MAP[priority].resolution] as number;
}

/**
 * Parses a "HH:MM" string into { hours, minutes }.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

/**
 * Sets the time on a zoned date (same date, different time).
 */
function setTimeOnDate(zonedDate: Date, hours: number, minutes: number): Date {
  const result = new Date(zonedDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Calculates the breach timestamp given a start time, target minutes, and SLA policy.
 *
 * When businessHours=false: simple addMinutes.
 * When businessHours=true: walks through business days/hours, skipping non-business time.
 *
 * All dates are in UTC. Business hours math is performed in the SLA's configured timezone.
 */
export function calculateBreachAt(startTime: Date, targetMinutes: number, sla: SlaPolicy): Date {
  if (!sla.businessHours) {
    return addMinutes(startTime, targetMinutes);
  }

  const tz = sla.timezone || 'UTC';
  const startStr = sla.businessHoursStart || '09:00';
  const endStr = sla.businessHoursEnd || '17:00';
  const businessDays = sla.businessDays.length > 0 ? sla.businessDays : [1, 2, 3, 4, 5];

  const bhStart = parseTime(startStr);
  const bhEnd = parseTime(endStr);

  const dayMinutes = (bhEnd.hours * 60 + bhEnd.minutes) - (bhStart.hours * 60 + bhStart.minutes);

  // Convert start time to the SLA's timezone
  let current = toZonedTime(startTime, tz);

  // Snap to business hours if needed
  const currentMinuteOfDay = current.getHours() * 60 + current.getMinutes();
  const startMinuteOfDay = bhStart.hours * 60 + bhStart.minutes;
  const endMinuteOfDay = bhEnd.hours * 60 + bhEnd.minutes;
  const currentDayOfWeek = current.getDay(); // 0 = Sunday

  if (!businessDays.includes(currentDayOfWeek) || currentMinuteOfDay >= endMinuteOfDay) {
    // Advance to next business day at start of business hours
    current = advanceToNextBusinessDay(current, businessDays, bhStart);
  } else if (currentMinuteOfDay < startMinuteOfDay) {
    // Snap to business hours start
    current = setTimeOnDate(current, bhStart.hours, bhStart.minutes);
  }

  let remainingMinutes = targetMinutes;

  while (remainingMinutes > 0) {
    const minuteOfDay = current.getHours() * 60 + current.getMinutes();
    const minutesRemainingInDay = endMinuteOfDay - minuteOfDay;

    if (minutesRemainingInDay <= 0) {
      // Should not happen due to snapping above, but safety guard
      current = advanceToNextBusinessDay(current, businessDays, bhStart);
      continue;
    }

    if (remainingMinutes <= minutesRemainingInDay) {
      // Finish within this business day
      current = addMinutes(current, remainingMinutes);
      remainingMinutes = 0;
    } else {
      // Consume the rest of this business day and move to next
      remainingMinutes -= minutesRemainingInDay;
      current = advanceToNextBusinessDay(current, businessDays, bhStart);
    }
  }

  // Convert back to UTC
  return fromZonedTime(current, tz);
}

/**
 * Advances the zoned date to the start of the next valid business day.
 */
function advanceToNextBusinessDay(
  zonedDate: Date,
  businessDays: number[],
  bhStart: { hours: number; minutes: number },
): Date {
  // Move to next day first
  let next = addDays(startOfDay(zonedDate), 1);

  // Keep advancing until we hit a business day
  let safety = 0;
  while (!businessDays.includes(next.getDay()) && safety < 14) {
    next = addDays(next, 1);
    safety++;
  }

  // Set to business hours start on that day
  return setTimeOnDate(next, bhStart.hours, bhStart.minutes);
}

/**
 * Calculates the response breach time for a ticket given its SLA policy and priority.
 */
export function calculateResponseAt(startTime: Date, sla: SlaPolicy, priority: Priority): Date {
  return calculateBreachAt(startTime, getResponseMinutes(sla, priority), sla);
}

/**
 * Calculates the resolution breach time for a ticket given its SLA policy and priority.
 */
export function calculateResolutionBreachAt(startTime: Date, sla: SlaPolicy, priority: Priority): Date {
  return calculateBreachAt(startTime, getResolutionMinutes(sla, priority), sla);
}

/**
 * Returns the elapsed percentage (0-∞) of the SLA window.
 * Values >= 100 indicate a breach.
 */
export function getElapsedPercentage(startTime: Date, breachAt: Date): number {
  const elapsed = Date.now() - startTime.getTime();
  const total = breachAt.getTime() - startTime.getTime();
  if (total <= 0) return 100;
  return Math.max(0, Math.round((elapsed / total) * 100));
}

/**
 * Maps an elapsed percentage to a human-readable SLA status.
 */
export function getSlaStatus(percentage: number): SlaStatusValue {
  if (percentage >= 100) return 'BREACHED';
  if (percentage >= 90) return 'CRITICAL';
  if (percentage >= 75) return 'WARNING';
  return 'OK';
}
