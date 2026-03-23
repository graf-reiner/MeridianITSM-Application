import { Worker, type Job } from 'bullmq';
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

const expo = new Expo();

export interface PushJobData {
  tenantId: string;
  userId: string;
  notificationType: string; // NotificationType enum value
  title: string;
  body?: string;
  screen?: string; // 'ticket', 'change', 'cab', etc.
  entityId?: string;
}

export const pushNotificationWorker = new Worker<PushJobData>(
  QUEUE_NAMES.PUSH_NOTIFICATION,
  async (job: Job<PushJobData>) => {
    const { tenantId, userId, notificationType, title, body, screen, entityId } = job.data;

    console.log(
      `[push-notification] Processing push for user ${userId} (type: ${notificationType}, entity: ${entityId ?? 'none'})`,
    );

    // ─── Step 1: Check per-user push preferences ──────────────────────────────
    // pushPreferences: null means all enabled
    // { "TICKET_ASSIGNED": false, ... } means that specific type is disabled

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { pushPreferences: true },
    });

    if (user?.pushPreferences !== null && user?.pushPreferences !== undefined) {
      const prefs = user.pushPreferences as Record<string, boolean>;
      if (prefs[notificationType] === false) {
        console.log(
          `[push-notification] Skipping push for user ${userId} — type ${notificationType} disabled in preferences`,
        );
        return;
      }
    }

    // ─── Step 2: Fetch active device tokens ───────────────────────────────────

    const deviceTokens = await prisma.deviceToken.findMany({
      where: { tenantId, userId, isActive: true },
    });

    if (deviceTokens.length === 0) {
      console.log(`[push-notification] No active device tokens for user ${userId} — skipping`);
      return;
    }

    // ─── Step 3: Check grouping — count recent notifications for same entity ──
    // When multiple events fire on the same ticket within the dedup window (60s),
    // the BullMQ jobId dedup collapses them to a single job. We still check recent
    // Notification records to build a meaningful "N updates" body for the push.

    let pushBody = body;
    if (entityId) {
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
      const recentCount = await prisma.notification.count({
        where: {
          tenantId,
          userId,
          resourceId: entityId,
          createdAt: { gte: sixtySecondsAgo },
        },
      });

      if (recentCount > 1) {
        pushBody = `${recentCount} updates on this ticket`;
        console.log(
          `[push-notification] Grouped ${recentCount} notifications for entity ${entityId} into single push`,
        );
      }
    }

    // ─── Step 4: Filter valid Expo push tokens and build messages ─────────────

    const validTokens = deviceTokens.filter((t) => Expo.isExpoPushToken(t.token));
    if (validTokens.length === 0) {
      console.log(`[push-notification] No valid Expo push tokens for user ${userId}`);
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map((t) => ({
      to: t.token,
      title,
      body: pushBody,
      data: { screen: screen ?? 'home', entityId: entityId ?? '' },
      sound: 'default',
    }));

    // ─── Step 5: Send via Expo Push API ───────────────────────────────────────

    const chunks = expo.chunkPushNotifications(messages);
    const allTickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        allTickets.push(...tickets);
      } catch (err) {
        console.error('[push-notification] Error sending push chunk:', err);
      }
    }

    // ─── Step 6: Handle DeviceNotRegistered errors — mark tokens inactive ─────

    const tokenIndexMap = new Map<string, string>(); // token -> deviceToken.id
    for (const dt of validTokens) {
      tokenIndexMap.set(dt.token, dt.id);
    }

    for (let i = 0; i < allTickets.length; i++) {
      const ticket = allTickets[i];
      const token = validTokens[i]?.token;

      if (ticket.status === 'error' && (ticket as { details?: { error?: string } }).details?.error === 'DeviceNotRegistered') {
        if (token) {
          const deviceTokenId = tokenIndexMap.get(token);
          if (deviceTokenId) {
            await prisma.deviceToken.update({
              where: { id: deviceTokenId },
              data: { isActive: false },
            });
            console.log(
              `[push-notification] Marked device token ${deviceTokenId} as inactive (DeviceNotRegistered)`,
            );
          }
        }
      }
    }

    console.log(
      `[push-notification] Sent ${allTickets.filter((t) => t.status === 'ok').length}/${validTokens.length} pushes to user ${userId}`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 3,
  },
);

pushNotificationWorker.on('failed', (job, err) => {
  console.error(`[push-notification] Job ${job?.id} failed:`, err.message);
});
