import { Worker } from 'bullmq';
import { prisma } from '@meridian/db';
import { bullmqConnection } from '../queues/connection.js';
import { QUEUE_NAMES } from '../queues/definitions.js';

const RETENTION_DAYS = 90;

/**
 * Daily chat conversation cleanup worker.
 *
 * Runs at 3 AM UTC to delete AI chat conversations (and their messages)
 * that are older than 90 days. Prevents unbounded storage growth.
 */
export const chatCleanupWorker = new Worker(
  QUEUE_NAMES.CHAT_CLEANUP,
  async (_job) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    // Delete messages first (foreign key), then conversations
    const deletedMessages = await prisma.chatMessage.deleteMany({
      where: {
        conversation: {
          updatedAt: { lt: cutoff },
        },
      },
    });

    const deletedConversations = await prisma.chatConversation.deleteMany({
      where: {
        updatedAt: { lt: cutoff },
      },
    });

    console.log(
      `[chat-cleanup] Deleted ${deletedConversations.count} conversations and ${deletedMessages.count} messages older than ${RETENTION_DAYS} days`,
    );
  },
  {
    connection: bullmqConnection,
    concurrency: 1,
  },
);

chatCleanupWorker.on('failed', (job, err) => {
  console.error(`[chat-cleanup] Job ${job?.id} failed:`, err.message);
});
