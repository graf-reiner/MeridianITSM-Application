import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock scaffold
// ---------------------------------------------------------------------------

const { mockPrisma, mockNotifyUser, mockTransitionStatus } = vi.hoisted(() => {
  return {
    mockPrisma: {} as Record<string, any>,
    mockNotifyUser: vi.fn().mockResolvedValue(undefined),
    mockTransitionStatus: vi.fn().mockResolvedValue(undefined),
  };
});

// CABMeeting mock fns
const cabMeetingCreate = vi.fn();
const cabMeetingFindFirst = vi.fn();

// CABMeetingAttendee mock fns
const cabAttendeeCreate = vi.fn();
const cabAttendeeFindFirst = vi.fn();
const cabAttendeeUpdate = vi.fn();

// CABMeetingChange mock fns
const cabChangeCreate = vi.fn();
const cabChangeFindFirst = vi.fn();
const cabChangeUpdate = vi.fn();

// Change mock fns
const changeFindFirst = vi.fn();

Object.assign(mockPrisma, {
  cABMeeting: { create: cabMeetingCreate, findFirst: cabMeetingFindFirst },
  cABMeetingAttendee: { create: cabAttendeeCreate, findFirst: cabAttendeeFindFirst, update: cabAttendeeUpdate },
  cABMeetingChange: { create: cabChangeCreate, findFirst: cabChangeFindFirst, update: cabChangeUpdate },
  change: { findFirst: changeFindFirst },
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@meridian/db', () => ({ prisma: mockPrisma }));

vi.mock('../services/notification.service.js', () => ({
  notifyUser: mockNotifyUser,
}));

vi.mock('../services/change.service.js', () => ({
  transitionStatus: mockTransitionStatus,
}));

vi.mock('ical-generator', () => {
  const mockEvent = {
    start: null as any,
    end: null as any,
    summary: '' as string,
    attendees: [] as Array<{ email: string }>,
  };
  const mockCal = {
    createEvent: vi.fn((opts: any) => {
      Object.assign(mockEvent, opts);
      return mockEvent;
    }),
    toString: vi.fn(() => {
      // Build a minimal iCal string that the tests can verify
      const lines = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        `SUMMARY:${mockEvent.summary}`,
        `DTSTART:${mockEvent.start instanceof Date ? mockEvent.start.toISOString() : mockEvent.start}`,
        `DTEND:${mockEvent.end instanceof Date ? mockEvent.end.toISOString() : mockEvent.end}`,
      ];
      if (mockEvent.attendees && Array.isArray(mockEvent.attendees)) {
        for (const a of mockEvent.attendees) {
          lines.push(`ATTENDEE:mailto:${a.email}`);
        }
      }
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return lines.join('\r\n');
    }),
  };
  return {
    default: vi.fn(() => mockCal),
  };
});

// Import service under test (after mocks)
import {
  createMeeting,
  addAttendee,
  updateRSVP,
  linkChange,
  recordOutcome,
  generateIcal,
} from '../services/cab.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const MEETING_ID = '00000000-0000-0000-0000-m00000000001';
const USER_ID = '00000000-0000-0000-0000-u00000000001';
const CHANGE_ID = '00000000-0000-0000-0000-c00000000001';
const ACTOR_ID = '00000000-0000-0000-0000-000000000099';
const ATTENDEE_ID = '00000000-0000-0000-0000-a00000000001';

const SCHEDULED_FOR = new Date('2026-05-01T14:00:00Z');

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CabService', () => {
  it('creates CAB meeting with status SCHEDULED', async () => {
    const meeting = {
      id: MEETING_ID,
      tenantId: TENANT_ID,
      title: 'Weekly CAB',
      scheduledFor: SCHEDULED_FOR,
      durationMinutes: 60,
      status: 'SCHEDULED',
    };
    cabMeetingCreate.mockResolvedValue(meeting);

    const result = await createMeeting(TENANT_ID, {
      title: 'Weekly CAB',
      scheduledFor: SCHEDULED_FOR,
    });

    expect(result.status).toBe('SCHEDULED');
    expect(cabMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          title: 'Weekly CAB',
          status: 'SCHEDULED',
        }),
      }),
    );
  });

  it('adds attendee with RSVP status PENDING', async () => {
    cabMeetingFindFirst.mockResolvedValue({
      id: MEETING_ID,
      title: 'Weekly CAB',
      scheduledFor: SCHEDULED_FOR,
    });

    const attendee = {
      id: ATTENDEE_ID,
      tenantId: TENANT_ID,
      meetingId: MEETING_ID,
      userId: USER_ID,
      role: 'MEMBER',
      rsvpStatus: 'PENDING',
    };
    cabAttendeeCreate.mockResolvedValue(attendee);

    const result = await addAttendee(TENANT_ID, MEETING_ID, USER_ID, 'MEMBER');

    expect(result.rsvpStatus).toBe('PENDING');
    expect(cabAttendeeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          meetingId: MEETING_ID,
          userId: USER_ID,
          role: 'MEMBER',
          rsvpStatus: 'PENDING',
        }),
      }),
    );
  });

  it('updates RSVP status to ACCEPTED', async () => {
    cabAttendeeFindFirst.mockResolvedValue({
      id: ATTENDEE_ID,
      meetingId: MEETING_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
      rsvpStatus: 'PENDING',
    });

    const updated = {
      id: ATTENDEE_ID,
      rsvpStatus: 'ACCEPTED',
    };
    cabAttendeeUpdate.mockResolvedValue(updated);

    const result = await updateRSVP(TENANT_ID, MEETING_ID, USER_ID, 'ACCEPTED');

    expect(result.rsvpStatus).toBe('ACCEPTED');
    expect(cabAttendeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTENDEE_ID },
        data: { rsvpStatus: 'ACCEPTED' },
      }),
    );
  });

  it('links change to meeting with agenda order', async () => {
    const meetingChange = {
      id: 'mc-1',
      tenantId: TENANT_ID,
      meetingId: MEETING_ID,
      changeId: CHANGE_ID,
      agendaOrder: 1,
    };
    cabChangeCreate.mockResolvedValue(meetingChange);

    const result = await linkChange(TENANT_ID, MEETING_ID, CHANGE_ID, 1);

    expect(result.agendaOrder).toBe(1);
    expect(cabChangeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          meetingId: MEETING_ID,
          changeId: CHANGE_ID,
          agendaOrder: 1,
        }),
      }),
    );
  });

  it('records outcome APPROVED and transitions change status', async () => {
    cabChangeFindFirst.mockResolvedValue({
      id: 'mc-1',
      meetingId: MEETING_ID,
      changeId: CHANGE_ID,
      tenantId: TENANT_ID,
    });
    cabChangeUpdate.mockResolvedValue({ id: 'mc-1', outcome: 'APPROVED' });
    changeFindFirst.mockResolvedValue(null); // for the fire-and-forget notification

    const result = await recordOutcome(
      TENANT_ID,
      MEETING_ID,
      CHANGE_ID,
      'APPROVED',
      'Looks good',
      ACTOR_ID,
    );

    expect(result.outcome).toBe('APPROVED');
    expect(mockTransitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CHANGE_ID,
      'APPROVED',
      ACTOR_ID,
    );
  });

  it('records outcome REJECTED and transitions change status', async () => {
    cabChangeFindFirst.mockResolvedValue({
      id: 'mc-1',
      meetingId: MEETING_ID,
      changeId: CHANGE_ID,
      tenantId: TENANT_ID,
    });
    cabChangeUpdate.mockResolvedValue({ id: 'mc-1', outcome: 'REJECTED' });
    changeFindFirst.mockResolvedValue(null);

    const result = await recordOutcome(
      TENANT_ID,
      MEETING_ID,
      CHANGE_ID,
      'REJECTED',
      'Too risky',
      ACTOR_ID,
    );

    expect(result.outcome).toBe('REJECTED');
    expect(mockTransitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      CHANGE_ID,
      'REJECTED',
      ACTOR_ID,
    );
  });

  it('generates valid iCal with correct start/end/summary', async () => {
    const durationMinutes = 90;
    cabMeetingFindFirst.mockResolvedValue({
      id: MEETING_ID,
      tenantId: TENANT_ID,
      title: 'Emergency CAB',
      scheduledFor: SCHEDULED_FOR,
      durationMinutes,
      location: 'Room A',
      meetingUrl: null,
      attendees: [],
      changes: [{ id: 'mc-1' }, { id: 'mc-2' }],
    });

    const icalString = await generateIcal(TENANT_ID, MEETING_ID);

    expect(icalString).toContain('BEGIN:VCALENDAR');
    expect(icalString).toContain('SUMMARY:Emergency CAB');
    // Verify start time
    expect(icalString).toContain(SCHEDULED_FOR.toISOString());
    // Verify end time (90 min later)
    const expectedEnd = new Date(SCHEDULED_FOR.getTime() + durationMinutes * 60_000);
    expect(icalString).toContain(expectedEnd.toISOString());
  });

  it('iCal includes attendee emails', async () => {
    cabMeetingFindFirst.mockResolvedValue({
      id: MEETING_ID,
      tenantId: TENANT_ID,
      title: 'Weekly CAB',
      scheduledFor: SCHEDULED_FOR,
      durationMinutes: 60,
      location: null,
      meetingUrl: null,
      attendees: [
        { user: { email: 'alice@example.com' } },
        { user: { email: 'bob@example.com' } },
        { user: { email: null } }, // should be filtered out
      ],
      changes: [],
    });

    const icalString = await generateIcal(TENANT_ID, MEETING_ID);

    expect(icalString).toContain('alice@example.com');
    expect(icalString).toContain('bob@example.com');
  });
});
