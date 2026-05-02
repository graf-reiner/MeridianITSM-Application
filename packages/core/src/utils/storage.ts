import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const INTERNAL_ENDPOINT = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';
// Public-facing endpoint baked into presigned URLs returned to browsers.
// Falls back to the internal endpoint when not set so dev with `localhost:9000`
// works for both server uploads AND browser downloads on the same host.
const PUBLIC_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT ?? INTERNAL_ENDPOINT;

const REGION = process.env.MINIO_REGION ?? 'us-east-1'; // MinIO ignores region but SDK requires it
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? 'meridian';
const SECRET_KEY = process.env.MINIO_SECRET_KEY ?? 'meridian123';

// Internal client — used for uploads, deletes, and any server-to-server I/O.
// Hits the LAN-internal MinIO endpoint (no extra hop through a public proxy).
const s3 = new S3Client({
  endpoint: INTERNAL_ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  forcePathStyle: true, // Required for MinIO — virtual-hosted style does not work
});

// Signing client — used ONLY by getFileUrl() to generate presigned URLs.
// Configured with the PUBLIC endpoint so the URL handed to the browser points
// at a host the browser can actually reach (the internal endpoint is usually
// localhost or a docker service name).
const s3Public = INTERNAL_ENDPOINT === PUBLIC_ENDPOINT
  ? s3
  : new S3Client({
      endpoint: PUBLIC_ENDPOINT,
      region: REGION,
      credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
      forcePathStyle: true,
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
 * Uses MINIO_PUBLIC_ENDPOINT (or MINIO_ENDPOINT as fallback) so the URL is
 * reachable from the browser, not just the server.
 */
export async function getFileUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Public, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete a file from MinIO/S3.
 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
