import 'dotenv/config'; // .env'i process.env'e yükle (diğer her şeyden önce)
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  PUBLIC_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY 64 hex karakter olmalı (32 byte)'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Geçersiz/eksik ortam değişkenleri:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;

// TV oturumu için istenecek Google scope'ları.
// Sadece login (hassas olmayan) scope'lar → Google doğrulama/limit derdi yok.
// Google Photos/Drive import'u ileride eklenirse photoslibrary/drive scope'ları buraya gelir.
export const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
