import { describe, it, expect } from 'vitest';
import {
  calculateBreachAt,
  calculateResponseAt,
  getElapsedPercentage,
  getSlaStatus,
  getResponseMinutes,
  getResolutionMinutes,
} from '../services/sla.service.js';

// Base SLA policy for tests
const baseSla = {
  businessHours: false,
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessDays: [1, 2, 3, 4, 5],
  timezone: 'UTC',
  autoEscalate: false,
  escalateToQueueId: null,
  p1ResponseMinutes: 60,
  p1ResolutionMinutes: 240,
  p2ResponseMinutes: 120,
  p2ResolutionMinutes: 480,
  p3ResponseMinutes: 240,
  p3ResolutionMinutes: 1440,
  p4ResponseMinutes: 480,
  p4ResolutionMinutes: 2880,
};

const businessHoursSla = {
  ...baseSla,
  businessHours: true,
};

describe('getResponseMinutes', () => {
  it('returns p1ResponseMinutes for CRITICAL priority', () => {
    expect(getResponseMinutes(baseSla, 'CRITICAL')).toBe(60);
  });

  it('returns p2ResponseMinutes for HIGH priority', () => {
    expect(getResponseMinutes(baseSla, 'HIGH')).toBe(120);
  });

  it('returns p3ResponseMinutes for MEDIUM priority', () => {
    expect(getResponseMinutes(baseSla, 'MEDIUM')).toBe(240);
  });

  it('returns p4ResponseMinutes for LOW priority', () => {
    expect(getResponseMinutes(baseSla, 'LOW')).toBe(480);
  });
});

describe('getResolutionMinutes', () => {
  it('returns p1ResolutionMinutes for CRITICAL priority', () => {
    expect(getResolutionMinutes(baseSla, 'CRITICAL')).toBe(240);
  });

  it('returns p2ResolutionMinutes for HIGH priority', () => {
    expect(getResolutionMinutes(baseSla, 'HIGH')).toBe(480);
  });

  it('returns p3ResolutionMinutes for MEDIUM priority', () => {
    expect(getResolutionMinutes(baseSla, 'MEDIUM')).toBe(1440);
  });

  it('returns p4ResolutionMinutes for LOW priority', () => {
    expect(getResolutionMinutes(baseSla, 'LOW')).toBe(2880);
  });
});

describe('calculateBreachAt (businessHours=false)', () => {
  it('returns startTime + targetMinutes when businessHours is false', () => {
    const start = new Date('2026-03-23T10:00:00Z'); // Monday 10:00 UTC
    const result = calculateBreachAt(start, 60, baseSla);
    expect(result).toEqual(new Date('2026-03-23T11:00:00Z'));
  });

  it('crosses midnight correctly without business hours', () => {
    const start = new Date('2026-03-23T23:00:00Z');
    const result = calculateBreachAt(start, 120, baseSla);
    expect(result).toEqual(new Date('2026-03-24T01:00:00Z'));
  });
});

describe('calculateBreachAt (businessHours=true, Mon-Fri 09:00-17:00 UTC)', () => {
  it('60 min target starting at 16:30 Monday completes at 09:30 Tuesday', () => {
    // Monday 16:30 UTC: 30 min remain in business day
    // Remaining: 30 min → carry over to Tuesday 09:00 + 30 min = 09:30
    const start = new Date('2026-03-23T16:30:00Z'); // Monday
    const result = calculateBreachAt(start, 60, businessHoursSla);
    expect(result).toEqual(new Date('2026-03-24T09:30:00Z')); // Tuesday 09:30
  });

  it('60 min target starting at 09:00 Monday completes at 10:00 Monday', () => {
    const start = new Date('2026-03-23T09:00:00Z'); // Monday 09:00
    const result = calculateBreachAt(start, 60, businessHoursSla);
    expect(result).toEqual(new Date('2026-03-23T10:00:00Z')); // Monday 10:00
  });

  it('skips Saturday and Sunday (Friday 16:30 + 60 min = Monday 09:30)', () => {
    // Friday 16:30: 30 min remain, 30 min carry over → skip Saturday, skip Sunday → Monday 09:30
    const start = new Date('2026-03-27T16:30:00Z'); // Friday
    const result = calculateBreachAt(start, 60, businessHoursSla);
    expect(result).toEqual(new Date('2026-03-30T09:30:00Z')); // Monday 09:30
  });

  it('snaps to business hours start if ticket created before business hours', () => {
    // 07:00 Monday — before business hours, snap to 09:00, then add 60 min
    const start = new Date('2026-03-23T07:00:00Z'); // Monday 07:00
    const result = calculateBreachAt(start, 60, businessHoursSla);
    expect(result).toEqual(new Date('2026-03-23T10:00:00Z')); // Monday 10:00
  });

  it('snaps to next business day if ticket created after business hours', () => {
    // 18:00 Monday — after business hours, snap to Tuesday 09:00, then add 60 min
    const start = new Date('2026-03-23T18:00:00Z'); // Monday 18:00
    const result = calculateBreachAt(start, 60, businessHoursSla);
    expect(result).toEqual(new Date('2026-03-24T10:00:00Z')); // Tuesday 10:00
  });

  it('handles weekend start (Saturday) by snapping to Monday', () => {
    // Saturday morning — skip to Monday 09:00, then add 60 min = 10:00
    const start = new Date('2026-03-28T10:00:00Z'); // Saturday
    const result = calculateBreachAt(start, 60, businessHoursSla);
    expect(result).toEqual(new Date('2026-03-30T10:00:00Z')); // Monday 10:00
  });
});

describe('calculateBreachAt with timezone (America/New_York)', () => {
  it('correctly handles America/New_York timezone', () => {
    // New York is UTC-4 in March (EDT). Business hours 09:00-17:00 NY = 13:00-21:00 UTC
    const nySla = {
      ...businessHoursSla,
      timezone: 'America/New_York',
    };
    // Start at Monday 16:30 NY time = 20:30 UTC
    // 30 min remain in NY business day → carry 30 min to Tuesday 09:00 NY = 09:30 NY
    // 09:30 NY = 13:30 UTC
    const start = new Date('2026-03-23T20:30:00Z'); // Monday 16:30 NY
    const result = calculateBreachAt(start, 60, nySla);
    expect(result).toEqual(new Date('2026-03-24T13:30:00Z')); // Tuesday 09:30 NY = 13:30 UTC
  });
});

describe('calculateResponseAt', () => {
  it('calls calculateBreachAt with correct response minutes for priority', () => {
    const start = new Date('2026-03-23T10:00:00Z');
    const result = calculateResponseAt(start, baseSla, 'CRITICAL');
    // p1ResponseMinutes = 60, no business hours
    expect(result).toEqual(new Date('2026-03-23T11:00:00Z'));
  });
});

describe('getElapsedPercentage', () => {
  it('returns 0 at start time', () => {
    const start = new Date(Date.now() - 0);
    const breach = new Date(Date.now() + 3600 * 1000);
    expect(getElapsedPercentage(start, breach)).toBe(0);
  });

  it('returns approximately 50 at halfway point', () => {
    const start = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    const breach = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    const pct = getElapsedPercentage(start, breach);
    expect(pct).toBeGreaterThanOrEqual(49);
    expect(pct).toBeLessThanOrEqual(51);
  });

  it('returns 100 at breach time', () => {
    const start = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const breach = new Date(Date.now()); // now
    const pct = getElapsedPercentage(start, breach);
    expect(pct).toBeGreaterThanOrEqual(99);
  });

  it('returns > 100 after breach time', () => {
    const start = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const breach = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const pct = getElapsedPercentage(start, breach);
    expect(pct).toBeGreaterThan(100);
  });
});

describe('getSlaStatus', () => {
  it('returns OK below 75%', () => {
    expect(getSlaStatus(0)).toBe('OK');
    expect(getSlaStatus(50)).toBe('OK');
    expect(getSlaStatus(74)).toBe('OK');
  });

  it('returns WARNING at 75-89%', () => {
    expect(getSlaStatus(75)).toBe('WARNING');
    expect(getSlaStatus(80)).toBe('WARNING');
    expect(getSlaStatus(89)).toBe('WARNING');
  });

  it('returns CRITICAL at 90-99%', () => {
    expect(getSlaStatus(90)).toBe('CRITICAL');
    expect(getSlaStatus(95)).toBe('CRITICAL');
    expect(getSlaStatus(99)).toBe('CRITICAL');
  });

  it('returns BREACHED at 100%+', () => {
    expect(getSlaStatus(100)).toBe('BREACHED');
    expect(getSlaStatus(150)).toBe('BREACHED');
  });
});
