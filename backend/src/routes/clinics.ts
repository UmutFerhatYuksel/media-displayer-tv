import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

export const clinicRouter = Router();
clinicRouter.use(requireAdmin);

// Tüm klinikler (tüm adminler hepsini görür) + cihaz/galeri sayıları.
clinicRouter.get('/', async (_req, res) => {
  const clinics = await prisma.clinic.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { devices: true, galleries: true, mediaItems: true } } },
  });
  res.json({
    clinics: clinics.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      deviceCount: c._count.devices,
      galleryCount: c._count.galleries,
      mediaCount: c._count.mediaItems,
      createdAt: c.createdAt,
    })),
  });
});

// Tek klinik detayı: cihazlar + galeriler.
clinicRouter.get('/:id', async (req, res) => {
  const clinic = await prisma.clinic.findUnique({
    where: { id: req.params.id },
    include: {
      devices: {
        orderBy: { createdAt: 'asc' },
        include: { ownGallery: true, sharedGallery: true },
      },
      galleries: {
        orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { items: true } } },
      },
    },
  });
  if (!clinic) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: clinic.id,
    name: clinic.name,
    address: clinic.address,
    devices: clinic.devices.map((d) => ({
      id: d.id,
      name: d.name,
      status: d.status,
      ownGalleryId: d.ownGalleryId,
      sharedGalleryId: d.sharedGalleryId,
      sharedGalleryName: d.sharedGallery?.name ?? null,
      lastSeenAt: d.lastSeenAt,
    })),
    galleries: clinic.galleries.map((g) => ({
      id: g.id,
      kind: g.kind,
      name: g.name,
      itemCount: g._count.items,
      loop: g.loop,
      shuffle: g.shuffle,
      imageDurationSec: g.imageDurationSec,
    })),
  });
});

const clinicBody = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
});

clinicRouter.post('/', async (req, res) => {
  const parsed = clinicBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const clinic = await prisma.clinic.create({ data: parsed.data });
  res.status(201).json({ id: clinic.id, name: clinic.name, address: clinic.address });
});

clinicRouter.patch('/:id', async (req, res) => {
  const parsed = clinicBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const result = await prisma.clinic.updateMany({ where: { id: req.params.id }, data: parsed.data });
  if (result.count === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

clinicRouter.delete('/:id', async (req, res) => {
  const clinic = await prisma.clinic.findUnique({ where: { id: req.params.id } });
  if (!clinic) return res.status(404).json({ error: 'not_found' });
  // Cascade: galeriler, galleryItem'lar, mediaItem'lar silinir; cihazlar SetNull ile boşa düşer.
  await prisma.clinic.delete({ where: { id: clinic.id } });
  res.json({ ok: true });
});
