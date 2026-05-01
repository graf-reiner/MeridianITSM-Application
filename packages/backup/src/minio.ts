import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

let _client: S3Client | null = null;

/**
 * Lazy singleton S3Client configured from environment variables.
 * Uses MINIO_* env vars to match the project-wide naming convention
 * (packages/core/src/utils/storage.ts, apps/api/src/services/storage.service.ts).
 * S3_REGION is kept separate — MinIO ignores it but the AWS SDK requires a value.
 */
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    endpoint:       process.env['MINIO_ENDPOINT'] ?? 'http://localhost:9000',
    region:         process.env['S3_REGION'] ?? 'us-east-1',
    forcePathStyle: true, // Required for MinIO — virtual-hosted style does not work
    credentials: {
      accessKeyId:     process.env['MINIO_ACCESS_KEY'] ?? 'meridian',
      secretAccessKey: process.env['MINIO_SECRET_KEY'] ?? 'meridian123',
    },
  });
  return _client;
}

/**
 * Upload a Buffer or Readable stream to the given bucket/key.
 * Applies AES256 server-side encryption by default.
 */
export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Readable,
  contentType = 'application/octet-stream',
  contentLength?: number,
): Promise<void> {
  // MinIO requires Content-Length on stream uploads — the SDK can't infer it from a Readable.
  // Callers that have the size (e.g. from fs.stat) should pass contentLength.
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: contentLength,
      ServerSideEncryption: 'AES256',
    }),
  );
}

/**
 * Download an object as a Node.js Readable stream.
 * Throws if the object body is missing (e.g. a 0-byte delete marker).
 */
export async function getObjectStream(bucket: string, key: string): Promise<Readable> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`Empty body for ${bucket}/${key}`);
  return res.Body as Readable;
}

/**
 * Delete a single object from the given bucket.
 */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * List all objects under a key prefix, handling pagination transparently.
 * Returns an array of { key, size, lastModified } records.
 */
export async function listPrefix(
  bucket: string,
  prefix: string,
): Promise<{ key: string; size: number; lastModified: Date }[]> {
  const out: { key: string; size: number; lastModified: Date }[] = [];
  let token: string | undefined;

  do {
    const res = await client().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) {
        out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

/**
 * Generate a pre-signed download URL for temporary access.
 * Default TTL: 15 minutes (900 s).
 */
export async function presignedDownloadUrl(
  bucket: string,
  key: string,
  ttlSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

/**
 * Ensure a bucket exists, creating it if it does not.
 * Uses HeadBucket to check; falls through to CreateBucket on any error
 * (covers both 404 Not Found and 403 access-denied-style responses from MinIO).
 */
export async function ensureBucket(bucket: string): Promise<void> {
  try {
    await client().send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client().send(new CreateBucketCommand({ Bucket: bucket }));
  }
}
