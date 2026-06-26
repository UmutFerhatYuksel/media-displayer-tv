import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  deleteObject,
  putObject,
  signedGetUrl,
  signedPutUrl,
  getObjectBuffer,
} from '../lib/r2.js';
import { generateAndStoreThumb } from '../lib/thumbnail.js';
import { URL_TTL } from '../lib/gallery.js';

export const mediaRouter = Router();
mediaRouter.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB / dosya
});

function typeOf(mime: string): 'IMAGE' | 'VIDEO' | null {
  return mime.startsWith('video/') ? 'VIDEO' : mime.startsWith('image/') ? 'IMAGE' : null;
}

function makeKey(clinicId: string, filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  return `${clinicId}/${crypto.randomUUID()}${ext}`;
}

// Klinik havuzundaki tüm medya (panel grid'i için thumbnail tercihli imzalı URL'lerle).
mediaRouter.get('/', async (req, res) => {
  const clinicId = z.string().min(1).safeParse(req.query.clinicId);
  if (!clinicId.success) return res.status(400).json({ error: 'clinicId_required' });
  const items = await prisma.mediaItem.findMany({
    where: { clinicId: clinicId.data },
    orderBy: { createdAt: 'desc' },
  });
  const withUrls = await Promise.all(
    items.map(async (m) => {
      const previewKey = m.thumbKey ?? m.r2Key;
      return {
        id: m.id,
        type: m.type,
        originalName: m.originalName,
        status: m.status,
        sizeBytes: m.sizeBytes,
        createdAt: m.createdAt,
        previewUrl: m.status === 'READY' && previewKey ? await signedGetUrl(previewKey, URL_TTL) : null,
      };
    }),
  );
  res.json({ items: withUrls });
});

// --- Doğrudan upload (küçük dosyalar; gövde backend'den geçer) ---
mediaRouter.post('/upload', upload.single('file'), async (req, res) => {
  const clinicId = z.string().min(1).safeParse(req.query.clinicId || req.body?.clinicId);
  if (!clinicId.success) return res.status(400).json({ error: 'clinicId_required' });
  if (!req.file) return res.status(400).json({ error: 'missing_file' });
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId.data } });
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });

  const mime = req.file.mimetype;
  const type = typeOf(mime);
  if (!type) return res.status(415).json({ error: 'unsupported_type' });

  // Klinik içi dedup: aynı içerik tekrar yüklenirse var olan kaydı döndür.
  const contentHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const existing = await prisma.mediaItem.findUnique({
    where: { clinicId_contentHash: { clinicId: clinic.id, contentHash } },
  });
  if (existing) return res.json({ ok: true, mediaId: existing.id, type: existing.type, deduped: true });

  const key = makeKey(clinic.id, req.file.originalname);
  await putObject(key, req.file.buffer, mime);
  const thumbKey = type === 'VIDEO' ? await generateAndStoreThumb(req.file.buffer, key) : null;

  const media = await prisma.mediaItem.create({
    data: {
      clinicId: clinic.id,
      type,
      status: 'READY',
      r2Key: key,
      thumbKey,
      contentHash,
      originalName: req.file.originalname,
      mimeType: mime,
      sizeBytes: req.file.size,
    },
  });
  res.status(201).json({ ok: true, mediaId: media.id, type });
});

// --- Doğrudan R2'ye upload (büyük videolar) ---
const presignBody = z.object({
  clinicId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

// 1) Panel: dosyayı doğrudan R2'ye PUT etmek için imzalı URL ister.
mediaRouter.post('/presign', async (req, res) => {
  const parsed = presignBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { clinicId, filename, contentType } = parsed.data;
  if (!typeOf(contentType)) return res.status(415).json({ error: 'unsupported_type' });
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });

  const key = makeKey(clinicId, filename);
  const putUrl = await signedPutUrl(key, contentType, 30 * 60);
  res.json({ putUrl, key });
});

const completeBody = z.object({
  clinicId: z.string().min(1),
  key: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
});

// 2) Panel: PUT bitince çağırır → MediaItem oluştur (video ise thumbnail üret).
mediaRouter.post('/complete', async (req, res) => {
  const parsed = completeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { clinicId, key, filename, contentType, sizeBytes } = parsed.data;
  // Güvenlik: anahtar bu kliniğin önekinde olmalı.
  if (!key.startsWith(`${clinicId}/`)) return res.status(403).json({ error: 'forbidden_key' });
  const type = typeOf(contentType);
  if (!type) return res.status(415).json({ error: 'unsupported_type' });
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });

  let thumbKey: string | null = null;
  if (type === 'VIDEO') {
    try {
      thumbKey = await generateAndStoreThumb(await getObjectBuffer(key), key);
    } catch {
      thumbKey = null;
    }
  }

  const media = await prisma.mediaItem.create({
    data: {
      clinicId,
      type,
      status: 'READY',
      r2Key: key,
      thumbKey,
      originalName: filename,
      mimeType: contentType,
      ...(sizeBytes != null ? { sizeBytes } : {}),
    },
  });
  res.status(201).json({ ok: true, mediaId: media.id, type });
});

mediaRouter.delete('/:id', async (req, res) => {
  const media = await prisma.mediaItem.findUnique({ where: { id: req.params.id } });
  if (!media) return res.status(404).json({ error: 'not_found' });
  if (media.r2Key) await deleteObject(media.r2Key).catch(() => {});
  if (media.thumbKey) await deleteObject(media.thumbKey).catch(() => {});
  await prisma.mediaItem.delete({ where: { id: media.id } });
  res.json({ ok: true });
});
