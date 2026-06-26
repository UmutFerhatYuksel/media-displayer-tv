import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { signedGetUrl } from '../lib/r2.js';
import { nextPosition, URL_TTL } from '../lib/gallery.js';

export const galleryRouter = Router();
galleryRouter.use(requireAdmin);

const createBody = z.object({
  clinicId: z.string().min(1),
  kind: z.enum(['DEVICE', 'SHARED']),
  name: z.string().trim().min(1).max(120),
});

// Galeri oluştur (genelde SHARED — DEVICE galerileri cihaz bağlanınca otomatik açılır).
galleryRouter.post('/', async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const clinic = await prisma.clinic.findUnique({ where: { id: parsed.data.clinicId } });
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });
  const gallery = await prisma.gallery.create({ data: parsed.data });
  res.status(201).json({ id: gallery.id, kind: gallery.kind, name: gallery.name });
});

const assignBody = z.object({
  galleryIds: z.array(z.string().min(1)).min(1),
  mediaIds: z.array(z.string().min(1)).min(1),
});

// Havuzdan seçilen medyayı bir veya birden çok galeriye (cihaz/ortak) topluca ekle.
// Medya havuzda kalır; yalnızca galerilere referans eklenir. Var olanlar atlanır.
galleryRouter.post('/assign', async (req, res) => {
  const parsed = assignBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { galleryIds, mediaIds } = parsed.data;

  const galleries = await prisma.gallery.findMany({ where: { id: { in: galleryIds } } });
  if (galleries.length === 0) return res.status(404).json({ error: 'no_gallery' });

  let added = 0;
  for (const g of galleries) {
    // Yalnızca galeriyle aynı kliniğe ait medya eklenebilir.
    const valid = await prisma.mediaItem.findMany({
      where: { id: { in: mediaIds }, clinicId: g.clinicId },
      select: { id: true },
    });
    const validIds = valid.map((m) => m.id);
    if (validIds.length === 0) continue;

    const existing = await prisma.galleryItem.findMany({
      where: { galleryId: g.id, mediaItemId: { in: validIds } },
      select: { mediaItemId: true },
    });
    const has = new Set(existing.map((e) => e.mediaItemId));
    const toAdd = validIds.filter((id) => !has.has(id));
    if (toAdd.length === 0) continue;

    let pos = await nextPosition(g.id);
    await prisma.galleryItem.createMany({
      data: toAdd.map((mediaItemId) => ({
        galleryId: g.id,
        mediaItemId,
        position: pos++,
        durationSec: g.imageDurationSec,
      })),
      skipDuplicates: true,
    });
    added += toAdd.length;
  }
  res.json({ ok: true, added });
});

// Galeri detayı: sıralı öğeler + önizleme (thumbnail varsa onu, yoksa görseli) imzalı URL'lerle.
galleryRouter.get('/:id', async (req, res) => {
  const gallery = await prisma.gallery.findUnique({
    where: { id: req.params.id },
    include: {
      items: { orderBy: { position: 'asc' }, include: { mediaItem: true, overlayImage: true } },
    },
  });
  if (!gallery) return res.status(404).json({ error: 'not_found' });
  const items = await Promise.all(
    gallery.items.map(async (it) => {
      const m = it.mediaItem;
      // Önizleme: video ise thumbKey, görselse r2Key. Panel grid'i için thumbnail tercih edilir.
      const previewKey = m.thumbKey ?? m.r2Key;
      return {
        galleryItemId: it.id,
        mediaId: m.id,
        type: m.type,
        originalName: m.originalName,
        durationSec: it.durationSec,
        previewUrl: previewKey ? await signedGetUrl(previewKey, URL_TTL) : null,
        // Overlay durumu (panel düzenleyici için)
        tickerText: it.tickerText,
        tickerColor: it.tickerColor,
        tickerOpacity: it.tickerOpacity,
        tickerBgColor: it.tickerBgColor,
        tickerBgOpacity: it.tickerBgOpacity,
        overlayImageId: it.overlayImageId,
        overlayImageUrl: it.overlayImage?.r2Key ? await signedGetUrl(it.overlayImage.r2Key, URL_TTL) : null,
        overlayX: it.overlayX,
        overlayY: it.overlayY,
        overlayW: it.overlayW,
        overlayH: it.overlayH,
      };
    }),
  );
  res.json({
    id: gallery.id,
    clinicId: gallery.clinicId,
    kind: gallery.kind,
    name: gallery.name,
    loop: gallery.loop,
    shuffle: gallery.shuffle,
    imageDurationSec: gallery.imageDurationSec,
    items,
  });
});

const patchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  loop: z.boolean().optional(),
  shuffle: z.boolean().optional(),
  imageDurationSec: z.number().int().min(1).max(600).optional(),
  // true ise yeni görsel süresi listedeki tüm öğelere uygulanır.
  applyDurationToAll: z.boolean().optional(),
});

galleryRouter.patch('/:id', async (req, res) => {
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { applyDurationToAll, ...data } = parsed.data;
  const result = await prisma.gallery.updateMany({ where: { id: req.params.id }, data });
  if (result.count === 0) return res.status(404).json({ error: 'not_found' });
  if (applyDurationToAll && data.imageDurationSec !== undefined) {
    await prisma.galleryItem.updateMany({
      where: { galleryId: req.params.id },
      data: { durationSec: data.imageDurationSec },
    });
  }
  res.json({ ok: true });
});

galleryRouter.delete('/:id', async (req, res) => {
  const gallery = await prisma.gallery.findUnique({ where: { id: req.params.id } });
  if (!gallery) return res.status(404).json({ error: 'not_found' });
  await prisma.gallery.delete({ where: { id: gallery.id } });
  res.json({ ok: true });
});

const addBody = z.object({
  mediaId: z.string().min(1),
  durationSec: z.number().int().min(1).max(600).optional(),
});

// Galeriye medya ekle (sona). Medya aynı kliniğe ait olmalı.
galleryRouter.post('/:id/items', async (req, res) => {
  const parsed = addBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const gallery = await prisma.gallery.findUnique({ where: { id: req.params.id } });
  if (!gallery) return res.status(404).json({ error: 'not_found' });

  const media = await prisma.mediaItem.findFirst({
    where: { id: parsed.data.mediaId, clinicId: gallery.clinicId },
  });
  if (!media) return res.status(404).json({ error: 'media_not_found' });

  const existing = await prisma.galleryItem.findUnique({
    where: { galleryId_mediaItemId: { galleryId: gallery.id, mediaItemId: media.id } },
  });
  if (existing) return res.json({ ok: true, galleryItemId: existing.id });

  const item = await prisma.galleryItem.create({
    data: {
      galleryId: gallery.id,
      mediaItemId: media.id,
      position: await nextPosition(gallery.id),
      durationSec: parsed.data.durationSec ?? gallery.imageDurationSec,
    },
  });
  res.status(201).json({ ok: true, galleryItemId: item.id });
});

galleryRouter.delete('/:id/items/:itemId', async (req, res) => {
  await prisma.galleryItem.deleteMany({
    where: { id: req.params.itemId, galleryId: req.params.id },
  });
  res.json({ ok: true });
});

const reorderBody = z.object({ orderedItemIds: z.array(z.string()).min(1) });

galleryRouter.put('/:id/reorder', async (req, res) => {
  const parsed = reorderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  await prisma.$transaction(
    parsed.data.orderedItemIds.map((id, index) =>
      prisma.galleryItem.updateMany({ where: { id, galleryId: req.params.id }, data: { position: index } }),
    ),
  );
  res.json({ ok: true });
});

const frac = z.number().min(0).max(1);
const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'invalid_color');
const overlayBody = z.object({
  tickerText: z.string().trim().max(500).nullable().optional(),
  tickerColor: hexColor.nullable().optional(),
  tickerOpacity: frac.optional(),
  tickerBgColor: hexColor.nullable().optional(),
  tickerBgOpacity: frac.optional(),
  overlayImageId: z.string().min(1).nullable().optional(),
  overlayX: frac.optional(),
  overlayY: frac.optional(),
  overlayW: frac.optional(),
  overlayH: frac.optional(),
});

// Bir galeri öğesine overlay (kayan yazı + banner görseli + konum) tanımla/güncelle.
galleryRouter.put('/:id/items/:itemId/overlay', async (req, res) => {
  const parsed = overlayBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  const gallery = await prisma.gallery.findUnique({ where: { id: req.params.id } });
  if (!gallery) return res.status(404).json({ error: 'not_found' });

  // Banner görseli verildiyse aynı kliniğe ait ve IMAGE olmalı.
  if (parsed.data.overlayImageId) {
    const img = await prisma.mediaItem.findFirst({
      where: { id: parsed.data.overlayImageId, clinicId: gallery.clinicId, type: 'IMAGE' },
    });
    if (!img) return res.status(404).json({ error: 'overlay_image_not_found' });
  }
  // Boş string ticker → null (gösterme).
  const data = { ...parsed.data };
  if (typeof data.tickerText === 'string' && data.tickerText.length === 0) data.tickerText = null;

  const result = await prisma.galleryItem.updateMany({
    where: { id: req.params.itemId, galleryId: gallery.id },
    data,
  });
  if (result.count === 0) return res.status(404).json({ error: 'item_not_found' });
  res.json({ ok: true });
});

const durationBody = z.object({ durationSec: z.number().int().min(1).max(600) });

galleryRouter.put('/:id/items/:itemId/duration', async (req, res) => {
  const parsed = durationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const result = await prisma.galleryItem.updateMany({
    where: { id: req.params.itemId, galleryId: req.params.id },
    data: { durationSec: parsed.data.durationSec },
  });
  if (result.count === 0) return res.status(404).json({ error: 'item_not_found' });
  res.json({ ok: true });
});
