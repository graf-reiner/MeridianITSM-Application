import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true,
});

export const BUCKET = process.env.MINIO_BUCKET ?? 'meridian-attachments';

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

export async function getFileSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Fetch an object's body + metadata from MinIO/S3 for streaming to a client.
 * Used when MinIO isn't publicly routable and the app must proxy the download.
 */
export async function getFileObject(key: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentLength: number | undefined;
  contentType: string | undefined;
}> {
  const res = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const body = res.Body as unknown as ReadableStream<Uint8Array>;
  return {
    body,
    contentLength: res.ContentLength,
    contentType: res.ContentType,
  };
}
