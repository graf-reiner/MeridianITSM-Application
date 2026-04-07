import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@meridian/db';

// ─── S3 Client (reuse same config as storage.service.ts) ─────────────────────

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET ?? 'meridian-attachments';

// ─── PDF Extraction ──────────────────────────────────────────────────────────

/**
 * Extract text from a PDF stored in MinIO and save to document_contents table.
 * Called after a PDF file is uploaded as a ticket attachment.
 *
 * Non-blocking — errors are logged but do not fail the upload.
 */
export async function extractPdfContent(
  tenantId: string,
  attachmentId: string,
  storagePath: string,
  filename: string,
): Promise<void> {
  try {
    // Download PDF from MinIO
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: storagePath }),
    );

    if (!response.Body) {
      console.warn(`[pdf-extract] No body for ${storagePath}`);
      return;
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Dynamic import pdf-parse
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as { default?: (buf: Buffer) => Promise<{ text: string }> }).default ?? pdfParseModule;
    const parsed = await (pdfParse as (buf: Buffer) => Promise<{ text: string }>)(buffer);

    const extractedText = parsed.text?.trim();
    if (!extractedText) {
      console.log(`[pdf-extract] No text content in ${filename}`);
      return;
    }

    // Store extracted text — use raw SQL since DocumentContent may not be in Prisma yet
    await prisma.$executeRawUnsafe(
      `INSERT INTO document_contents (id, "tenantId", "sourceType", "sourceId", filename, "extractedText", "extractedAt")
       VALUES (gen_random_uuid(), $1::uuid, 'ticket_attachment', $2::uuid, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      tenantId,
      attachmentId,
      filename,
      extractedText.slice(0, 500_000), // Cap at 500KB of text
    );

    console.log(`[pdf-extract] Extracted ${extractedText.length} chars from ${filename}`);
  } catch (err) {
    console.error(`[pdf-extract] Failed for ${filename}:`, err instanceof Error ? err.message : err);
    // Don't throw — PDF extraction failure should not block the upload
  }
}
