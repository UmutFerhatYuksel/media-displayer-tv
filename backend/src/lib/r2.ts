import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: config.R2_ENDPOINT,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = config.R2_BUCKET;

// Buffer/stream'i R2'ye yükle.
export async function putObject(key: string, body: Buffer | Uint8Array, contentType?: string) {
  await r2.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

// R2 nesnesini Buffer olarak indir (örn. thumbnail üretimi için video gövdesi).
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of out.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// TV'nin doğrudan medyayı okuması için kısa ömürlü imzalı GET URL'i.
export function signedGetUrl(key: string, expiresInSec = 3600): Promise<string> {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: expiresInSec,
  });
}

// Telefondan (upload.html) doğrudan R2'ye PUT için imzalı URL.
export function signedPutUrl(key: string, contentType: string, expiresInSec = 600): Promise<string> {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSec },
  );
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
