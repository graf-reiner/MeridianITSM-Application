/**
 * Cron expression utilities for recurring tickets.
 *
 * Uses a simple cron parser — supports standard 5-field cron expressions:
 *   minute hour day-of-month month day-of-week
 *
 * Examples:
 *   "0 9 * * 1"     — Every Monday at 9:00 AM
 *   "0 0 1 * *"     — First of every month at midnight
 *   "0 9 * * 1-5"   — Every weekday at 9:00 AM
 *   "0 8 15 * *"    — 15th of every month at 8:00 AM
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addMinutes, addHours, addDays, addMonths, setHours, setMinutes, startOfDay, getDay, getDate, getMonth } from 'date-fns';

interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  const values: number[] = [];

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.push(i);
    } else if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step, 10);
      const start = range === '*' ? min : parseInt(range, 10);
      for (let i = start; i <= max; i += stepNum) values.push(i);
    } else if (part.includes('-')) {
      const [from, to] = part.split('-').map(Number);
      for (let i = from; i <= to; i++) values.push(i);
    } else {
      values.push(parseInt(part, 10));
    }
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function parseCron(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  try {
    return {
      minutes: parseField(parts[0], 0, 59),
      hours: parseField(parts[1], 0, 23),
      daysOfMonth: parseField(parts[2], 1, 31),
      months: parseField(parts[3], 1, 12),
      daysOfWeek: parseField(parts[4], 0, 6),
    };
  } catch {
    return null;
  }
}

function matchesCron(date: Date, fields: CronFields): boolean {
  return (
    fields.minutes.includes(date.getMinutes()) &&
    fields.hours.includes(date.getHours()) &&
    fields.months.includes(date.getMonth() + 1) &&
    (fields.daysOfMonth.length === 31 || fields.daysOfMonth.includes(date.getDate())) &&
    (fields.daysOfWeek.length === 7 || fields.daysOfWeek.includes(date.getDay()))
  );
}

/**
 * Get the next occurrence date for a cron expression.
 * Returns null if the expression is invalid.
 */
export function getNextCronDate(expression: string, timezone: string): Date | null {
  const fields = parseCron(expression);
  if (!fields) return null;

  const now = toZonedTime(new Date(), timezone);
  let candidate = addMinutes(now, 1);
  // Reset seconds
  candidate.setSeconds(0, 0);

  // Search up to 366 days ahead
  const maxIterations = 366 * 24 * 60; // minutes in a year
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(candidate, fields)) {
      return fromZonedTime(candidate, timezone);
    }
    candidate = addMinutes(candidate, 1);
  }

  return null;
}

/**
 * Get the next N occurrences for a cron expression.
 */
export function getNextOccurrences(expression: string, timezone: string, count: number): Date[] {
  const fields = parseCron(expression);
  if (!fields) return [];

  const results: Date[] = [];
  const now = toZonedTime(new Date(), timezone);
  let candidate = addMinutes(now, 1);
  candidate.setSeconds(0, 0);

  const maxIterations = 366 * 24 * 60;
  let iterations = 0;

  while (results.length < count && iterations < maxIterations) {
    if (matchesCron(candidate, fields)) {
      results.push(fromZonedTime(candidate, timezone));
    }
    candidate = addMinutes(candidate, 1);
    iterations++;
  }

  return results;
}
