import ical from 'ical-generator';
import { prisma } from '@meridian/db';
import { notifyUser } from './notification.service.js';
import { transitionStatus } from './change.service.js';
import { formatChangeNumber } from '@meridian/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateMeetingData {
  title: string;
  scheduledFor: Date | string;
  durationMinutes?: number;
  location?: string;
  meetingUrl?: string;
  notes?: string;
}

export interface UpdateMeetingData {
  title?: string;
  scheduledFor?: Date | string;
  durationMinutes?: number;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  status?: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface MeetingListFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export type CABOutcome = 'APPROVED' | 'REJECTED' | 'DEFERRED' | 'NEEDS_MORE_INFO';

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Create a new CAB meeting with status SCHEDULED.
 */
export async function createMeeting(
  tenantId: string,
  data: CreateMeetingData,
) {
  return prisma.cABMeeting.create({
    data: {
      tenantId,
      title: data.title,
      scheduledFor: new Date(data.scheduledFor),
      durationMinutes: data.durationMinutes ?? 60,
      location: data.location,
      meetingUrl: data.meetingUrl,
      notes: data.notes,
      status: 'SCHEDULED',
    },
  });
}

/**
 * Get a CAB meeting with full attendee and change agenda included.
 */
export async function getMeeting(tenantId: string, meetingId: string) {
  return prisma.cABMeeting.findFirst({
    where: { id: meetingId, tenantId },
    include: {
      attendees: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { role: 'asc' },
      },
      changes: {
        include: {
          change: {
            select: {
              id: true,
              changeNumber: true,
              title: true,
              status: true,
              type: true,
              riskLevel: true,
            },
          },
        },
        orderBy: { agendaOrder: 'asc' },
      },
    },
  });
}

/**
 * List CAB meetings with optional status and date filters.
 */
export async function listMeetings(tenantId: string, filters: MeetingListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { tenantId };

  if (filters.status) where.status = filters.status;

  if (filters.dateFrom || filters.dateTo) {
    where.scheduledFor = {};
    if (filters.dateFrom) (where.scheduledFor as Record<string, unknown>).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.scheduledFor as Record<string, unknown>).lte = new Date(filters.dateTo);
  }

  const [data, total] = await Promise.all([
    prisma.cABMeeting.findMany({
      where,
      include: {
        attendees: {
          select: { id: true, userId: true, role: true, rsvpStatus: true },
        },
        changes: {
          select: { id: true, changeId: true, agendaOrder: true, outcome: true },
        },
      },
      orderBy: { scheduledFor: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.cABMeeting.count({ where }),
  ]);

  return { data, total, page, pageSize };
}

/**
 * Update a CAB meeting's mutable fields.
 */
export async function updateMeeting(
  tenantId: string,
  meetingId: string,
  data: UpdateMeetingData,
) {
  const existing = await prisma.cABMeeting.findFirst({ where: { id: meetingId, tenantId } });
  if (!existing) {
    const err = new Error('CAB meeting not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const updates: Record<string, unknown> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.scheduledFor !== undefined) updates.scheduledFor = new Date(data.scheduledFor);
  if (data.durationMinutes !== undefined) updates.durationMinutes = data.durationMinutes;
  if (data.location !== undefined) updates.location = data.location;
  if (data.meetingUrl !== undefined) updates.meetingUrl = data.meetingUrl;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.status !== undefined) updates.status = data.status;

  return prisma.cABMeeting.update({ where: { id: meetingId }, data: updates });
}

/**
 * Add an attendee to a CAB meeting.
 * Fires a CAB_INVITATION notification to the user.
 */
export async function addAttendee(
  tenantId: string,
  meetingId: string,
  userId: string,
  role: 'CHAIRPERSON' | 'MEMBER' | 'OBSERVER' = 'MEMBER',
) {
  const meeting = await prisma.cABMeeting.findFirst({
    where: { id: meetingId, tenantId },
    select: { id: true, title: true, scheduledFor: true },
  });

  if (!meeting) {
    const err = new Error('CAB meeting not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // upsert handles the @@unique([meetingId, userId]) constraint gracefully
  const attendee = await prisma.cABMeetingAttendee.create({
    data: {
      tenantId,
      meetingId,
      userId,
      role,
      rsvpStatus: 'PENDING',
    },
  });

  // Fire-and-forget: notify the invitee
  void (async () => {
    try {
      await notifyUser({
        tenantId,
        userId,
        type: 'CAB_INVITATION',
        title: `You are invited to CAB meeting: ${meeting.title}`,
        body: `Scheduled for ${meeting.scheduledFor.toISOString()}`,
        resourceId: meetingId,
        resource: 'cab_meeting',
      });
    } catch (err) {
      console.error('[cab.service] addAttendee notification failed:', err);
    }
  })();

  return attendee;
}

/**
 * Remove an attendee from a CAB meeting by attendee record ID.
 */
export async function removeAttendee(
  tenantId: string,
  meetingId: string,
  attendeeId: string,
) {
  const attendee = await prisma.cABMeetingAttendee.findFirst({
    where: { id: attendeeId, meetingId, tenantId },
  });

  if (!attendee) {
    const err = new Error('Attendee not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return prisma.cABMeetingAttendee.delete({ where: { id: attendeeId } });
}

/**
 * Update a user's RSVP status for a CAB meeting.
 */
export async function updateRSVP(
  tenantId: string,
  meetingId: string,
  userId: string,
  rsvpStatus: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE',
) {
  const attendee = await prisma.cABMeetingAttendee.findFirst({
    where: { meetingId, userId, tenantId },
  });

  if (!attendee) {
    const err = new Error('Attendee not found for this meeting') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return prisma.cABMeetingAttendee.update({
    where: { id: attendee.id },
    data: { rsvpStatus },
  });
}

/**
 * Link a change to a CAB meeting agenda.
 * agendaOrder determines display order in the meeting agenda.
 */
export async function linkChange(
  tenantId: string,
  meetingId: string,
  changeId: string,
  agendaOrder: number,
) {
  return prisma.cABMeetingChange.create({
    data: { tenantId, meetingId, changeId, agendaOrder },
  });
}

/**
 * Record the outcome of a change review in a CAB meeting.
 * If APPROVED, transitions the change to APPROVED status.
 * If REJECTED, transitions the change to REJECTED status.
 */
export async function recordOutcome(
  tenantId: string,
  meetingId: string,
  changeId: string,
  outcome: CABOutcome,
  notes: string | undefined,
  actorId: string,
) {
  const meetingChange = await prisma.cABMeetingChange.findFirst({
    where: { meetingId, changeId, tenantId },
  });

  if (!meetingChange) {
    const err = new Error('Change not linked to this meeting') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Update the outcome record
  await prisma.cABMeetingChange.update({
    where: { id: meetingChange.id },
    data: { outcome: outcome as any, notes },
  });

  // Trigger status transitions based on outcome
  if (outcome === 'APPROVED') {
    try {
      await transitionStatus(tenantId, changeId, 'APPROVED', actorId);
    } catch (err) {
      // If transition fails (e.g., change already approved), log but don't fail
      console.error('[cab.service] recordOutcome APPROVED transition failed:', err);
    }
  } else if (outcome === 'REJECTED') {
    try {
      await transitionStatus(tenantId, changeId, 'REJECTED', actorId);
    } catch (err) {
      console.error('[cab.service] recordOutcome REJECTED transition failed:', err);
    }
  }

  // Fire-and-forget: notify the change requestedBy
  void (async () => {
    try {
      const change = await prisma.change.findFirst({
        where: { id: changeId, tenantId },
        select: { requestedById: true, changeNumber: true, title: true },
      });

      if (change?.requestedById && change.requestedById !== actorId) {
        await notifyUser({
          tenantId,
          userId: change.requestedById,
          type: 'CHANGE_UPDATED',
          title: `CAB outcome for Change ${formatChangeNumber(change.changeNumber)}: ${outcome}`,
          body: change.title,
          resourceId: changeId,
          resource: 'change',
        });
      }
    } catch (err) {
      console.error('[cab.service] recordOutcome notification failed:', err);
    }
  })();

  return { success: true, outcome };
}

/**
 * Generate an iCal (.ics) file string for a CAB meeting.
 * Returns the iCal content — caller should set text/calendar headers.
 */
export async function generateIcal(tenantId: string, meetingId: string): Promise<string> {
  const meeting = await prisma.cABMeeting.findFirst({
    where: { id: meetingId, tenantId },
    include: {
      attendees: {
        include: {
          user: { select: { email: true } },
        },
      },
      changes: {
        select: { id: true },
        orderBy: { agendaOrder: 'asc' },
      },
    },
  });

  if (!meeting) {
    const err = new Error('CAB meeting not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const attendeeEmails = meeting.attendees
    .map((a) => a.user.email)
    .filter((email): email is string => Boolean(email));

  const cal = ical({ name: 'MeridianITSM - CAB Meeting' });

  cal.createEvent({
    start: meeting.scheduledFor,
    end: new Date(meeting.scheduledFor.getTime() + meeting.durationMinutes * 60_000),
    summary: meeting.title,
    location: meeting.location ?? undefined,
    url: meeting.meetingUrl ?? undefined,
    description: `CAB Meeting\n\nAgenda items: ${meeting.changes.length} changes pending review`,
    attendees: attendeeEmails.map((email) => ({ email, rsvp: true })),
  });

  return cal.toString();
}
