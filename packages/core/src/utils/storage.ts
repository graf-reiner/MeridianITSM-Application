import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.MINIO_REGION ?? 'us-east-1', // MinIO ignores region but SDK requires it
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'meridian',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'meridian123',
  },
  forcePathStyle: true, // Required for MinIO — virtual-hosted style does not work
});

const BUCKET = process.env.STORAGE_BUCKET ?? 'meridian';

/**
 * Build a tenant-prefixed storage path for isolation.
 * Format: {tenantId}/{resource}/{filename}
 */
export function buildStoragePath(tenantId: string, resource: string, filename: string): string {
  return `${tenantId}/${resource}/${filename}`;
}

/**
 * Upload a file to MinIO/S3 with a tenant-prefixed path.
 * Returns the storage key (path) used.
 */
export async function uploadFile(
  tenantId: string,
  resource: string,
  filename: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const key = buildStoragePath(tenantId, resource, filename);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Generate a pre-signed URL for temporary file access (default: 1 hour).
 */
export async function getFileUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete a file from MinIO/S3.
 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
