import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { deleteObject, putObject, signedGetUrl } from '../lib/r2.js';
import { generateAndStoreThumb } from '../lib/thumbnail.js';
import { getValidAccessToken } from '../google/oauth.js';
import { listAlbumItems, isVideo, downloadPhotosItem } from '../google/photos.js';
import { listFiles, downloadDriveFile } from '../google/drive.js';
import { addToDefaultPlaylist } from '../lib/playlist.js';

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

const MEDIA_URL_TTL = 3600; // galeri önizleme URL'i ömrü (sn)

// Kullanıcının tüm medyası (galeri için imzalı önizleme URL'leriyle).
mediaRouter.get('/', async (req, res) => {
  const items = await prisma.mediaItem.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  const withUrls = await Promise.all(
    items.map(async (m) => ({
      id: m.id,
      type: m.type,
      originalName: m.originalName,
      status: m.status,
      width: m.width,
      height: m.height,
      createdAt: m.createdAt,
      // READY olmayan / r2Key'i olmayan öğelerde önizleme yok.
      url: m.status === 'READY' && m.r2Key ? await signedGetUrl(m.r2Key, MEDIA_URL_TTL) : null,
      // video önizleme karesi (varsa) — galeride video karolarında gösterilir.
      thumbnailUrl: m.thumbKey ? await signedGetUrl(m.thumbKey, MEDIA_URL_TTL) : null,
    })),
  );
  res.json({ items: withUrls });
});

const importBody = z.object({
  source: z.enum(['GOOGLE_PHOTOS', 'GOOGLE_DRIVE']),
  // Photos için albumId zorunlu (seçilen id'leri o albümden çözeriz); Drive için gerekmez.
  albumId: z.string().optional(),
  ids: z.array(z.string().min(1)).min(1),
});

// Seçilen Google öğelerini R2'ye kopyalar, MediaItem oluşturur, playlist'e ekler.
mediaRouter.post('/import', async (req, res) => {
  const parsed = importBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { source, albumId, ids } = parsed.data;
  const userId = req.userId!;

  try {
    const token = await getValidAccessToken(userId);
    const wanted = new Set(ids);
    const imported: string[] = [];

    if (source === 'GOOGLE_PHOTOS') {
      if (!albumId) return res.status(400).json({ error: 'albumId_required' });
      const all = await listAlbumItems(token, albumId);
      for (const item of all.filter((i) => wanted.has(i.id))) {
        const buf = await downloadPhotosItem(item);
        const type = isVideo(item) ? 'VIDEO' : 'IMAGE';
        const key = makeKey(userId, item.filename);
        await putObject(key, buf, item.mimeType);
        const thumbKey = type === 'VIDEO' ? await generateAndStoreThumb(buf, key) : null;
        const media = await upsertMedia({
          userId, type, source, sourceRef: item.id, r2Key: key, thumbKey,
          originalName: item.filename, mimeType: item.mimeType, sizeBytes: buf.length,
          width: num(item.mediaMetadata?.width), height: num(item.mediaMetadata?.height),
        });
        await addToDefaultPlaylist(userId, media.id);
        imported.push(media.id);
      }
    } else {
      const all = await listFiles(token);
      for (const file of all.filter((f) => wanted.has(f.id))) {
        const buf = await downloadDriveFile(token, file.id);
        const type = file.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE';
        const key = makeKey(userId, file.name);
        await putObject(key, buf, file.mimeType);
        const thumbKey = type === 'VIDEO' ? await generateAndStoreThumb(buf, key) : null;
        const media = await upsertMedia({
          userId, type, source, sourceRef: file.id, r2Key: key, thumbKey,
          originalName: file.name, mimeType: file.mimeType, sizeBytes: buf.length,
          width: file.imageMediaMetadata?.width ?? file.videoMediaMetadata?.width,
          height: file.imageMediaMetadata?.height ?? file.videoMediaMetadata?.height,
          durationSec: file.videoMediaMetadata?.durationMillis
            ? Number(file.videoMediaMetadata.durationMillis) / 1000
            : undefined,
        });
        await addToDefaultPlaylist(userId, media.id);
        imported.push(media.id);
      }
    }

    res.json({ importedCount: imported.length, ids: imported });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'import_failed' });
  }
});

mediaRouter.delete('/:id', async (req, res) => {
  const media = await prisma.mediaItem.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!media) return res.status(404).json({ error: 'not_found' });
  if (media.r2Key) await deleteObject(media.r2Key).catch(() => {});
  await prisma.mediaItem.delete({ where: { id: media.id } });
  res.json({ ok: true });
});

// --- yardımcılar ---

function makeKey(userId: string, name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  return `${userId}/${crypto.randomUUID()}${ext}`;
}

function num(v?: string): number | undefined {
  return v ? Number(v) : undefined;
}

async function upsertMedia(data: {
  userId: string; type: 'IMAGE' | 'VIDEO'; source: 'GOOGLE_PHOTOS' | 'GOOGLE_DRIVE';
  sourceRef: string; r2Key: string; thumbKey?: string | null; originalName: string; mimeType: string;
  sizeBytes: number; width?: number; height?: number; durationSec?: number;
}) {
  // Aynı kaynak öğesi tekrar import edilirse güncelle (unique: userId+source+sourceRef).
  return prisma.mediaItem.upsert({
    where: {
      userId_source_sourceRef: { userId: data.userId, source: data.source, sourceRef: data.sourceRef },
    },
    create: { ...data, status: 'READY' },
    update: { ...data, status: 'READY' },
  });
}
