import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { putObject, signedPutUrl, getObjectBuffer } from '../lib/r2.js';
import { addToDefaultPlaylist } from '../lib/playlist.js';
import { generateAndStoreThumb } from '../lib/thumbnail.js';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB / dosya
});

// TV (auth) çağırır: telefonun açacağı tek seferlik yükleme oturumu/QR linki.
uploadRouter.post('/session', requireAuth, async (req, res) => {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 60_000); // 30 dk
  await prisma.uploadSession.create({ data: { userId: req.userId!, token, expiresAt } });
  res.json({
    token,
    uploadUrl: `${config.PUBLIC_BASE_URL}/upload.html?token=${token}`,
    expiresAt,
  });
});

// Telefon (login YOK, token ile) dosya gönderir. token query veya body'de olabilir.
uploadRouter.post('/file', upload.single('file'), async (req, res) => {
  const token = (req.query.token as string) || (req.body?.token as string);
  if (!token) return res.status(400).json({ error: 'missing_token' });
  if (!req.file) return res.status(400).json({ error: 'missing_file' });

  const session = await prisma.uploadSession.findUnique({ where: { token } });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({ error: 'invalid_or_expired_session' });
  }

  const mime = req.file.mimetype;
  const type = mime.startsWith('video/') ? 'VIDEO' : mime.startsWith('image/') ? 'IMAGE' : null;
  if (!type) return res.status(415).json({ error: 'unsupported_type' });

  // İçerik hash'i (dedup anahtarı): aynı dosya tekrar yüklenirse yeni kayıt/nesne oluşmaz.
  const contentHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const existing = await prisma.mediaItem.findUnique({
    where: { userId_source_sourceRef: { userId: session.userId, source: 'UPLOAD', sourceRef: contentHash } },
  });

  let media = existing;
  if (!media) {
    const ext = req.file.originalname.includes('.')
      ? req.file.originalname.slice(req.file.originalname.lastIndexOf('.'))
      : '';
    const key = `${session.userId}/${crypto.randomUUID()}${ext}`;
    await putObject(key, req.file.buffer, mime);
    const thumbKey = type === 'VIDEO' ? await generateAndStoreThumb(req.file.buffer, key) : null;

    media = await prisma.mediaItem.create({
      data: {
        userId: session.userId,
        type,
        source: 'UPLOAD',
        status: 'READY',
        r2Key: key,
        thumbKey,
        sourceRef: contentHash,
        originalName: req.file.originalname,
        mimeType: mime,
        sizeBytes: req.file.size,
      },
    });
  }
  await addToDefaultPlaylist(session.userId, media.id);
  await prisma.uploadSession.update({
    where: { token },
    data: { usedCount: { increment: 1 } },
  });

  res.json({ ok: true, mediaId: media.id, type });
});

// --- Doğrudan R2'ye yükleme (büyük videolar için; tünel/backend gövdesinden geçmez) ---

// Token'lı oturumu doğrula, süresini kontrol et.
async function validSession(token?: string) {
  if (!token) return null;
  const s = await prisma.uploadSession.findUnique({ where: { token } });
  if (!s || s.expiresAt.getTime() < Date.now()) return null;
  return s;
}

function typeOf(contentType: string): 'IMAGE' | 'VIDEO' | null {
  return contentType.startsWith('video/') ? 'VIDEO' : contentType.startsWith('image/') ? 'IMAGE' : null;
}

const presignBody = z.object({
  token: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

// 1) Telefon: dosyayı doğrudan R2'ye PUT etmek için imzalı URL ister.
uploadRouter.post('/presign', async (req, res) => {
  const parsed = presignBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { token, filename, contentType } = parsed.data;

  const session = await validSession(token);
  if (!session) return res.status(401).json({ error: 'invalid_or_expired_session' });
  if (!typeOf(contentType)) return res.status(415).json({ error: 'unsupported_type' });

  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  const key = `${session.userId}/${crypto.randomUUID()}${ext}`;
  const putUrl = await signedPutUrl(key, contentType, 30 * 60); // 30 dk (büyük video için)
  res.json({ putUrl, key });
});

const completeBody = z.object({
  token: z.string().min(1),
  key: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
});

// 2) Telefon: PUT bitince çağırır → MediaItem oluştur + listeye ekle.
uploadRouter.post('/complete', async (req, res) => {
  const parsed = completeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { token, key, filename, contentType, sizeBytes } = parsed.data;

  const session = await validSession(token);
  if (!session) return res.status(401).json({ error: 'invalid_or_expired_session' });
  // Güvenlik: yalnızca bu kullanıcının önekindeki anahtar kaydedilebilir.
  if (!key.startsWith(`${session.userId}/`)) return res.status(403).json({ error: 'forbidden_key' });
  const type = typeOf(contentType);
  if (!type) return res.status(415).json({ error: 'unsupported_type' });

  // Video ise R2'den indirip önizleme karesi üret (telefon doğrudan R2'ye PUT etti,
  // gövde backend'den geçmedi). Hata olursa thumbnail'siz devam et.
  let thumbKey: string | null = null;
  if (type === 'VIDEO') {
    try {
      const buf = await getObjectBuffer(key);
      thumbKey = await generateAndStoreThumb(buf, key);
    } catch {
      thumbKey = null;
    }
  }

  const media = await prisma.mediaItem.create({
    data: {
      userId: session.userId,
      type,
      source: 'UPLOAD',
      status: 'READY',
      r2Key: key,
      thumbKey,
      originalName: filename,
      mimeType: contentType,
      ...(sizeBytes != null ? { sizeBytes } : {}),
    },
  });
  await addToDefaultPlaylist(session.userId, media.id);
  await prisma.uploadSession.update({ where: { token }, data: { usedCount: { increment: 1 } } });

  res.json({ ok: true, mediaId: media.id, type });
});
