import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── S3 / MinIO Client ────────────────────────────────────────────────────────

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true, // Required for MinIO path-style addressing
});

export const BUCKET = process.env.MINIO_BUCKET ?? 'meridian-attachments';

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Upload a file buffer to MinIO/S3.
 * Returns the storage key on success.
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return key;
}

/**
 * Generate a presigned GET URL for a stored file.
 * URL expires in `expiresIn` seconds (default 1 hour).
 */
export async function getFileSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}
