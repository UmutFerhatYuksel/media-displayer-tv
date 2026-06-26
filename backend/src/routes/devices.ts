import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { triggerSync } from '../lib/syncBus.js';

export const deviceAdminRouter = Router();
deviceAdminRouter.use(requireAdmin);

const bindBody = z.object({
  pairingCode: z.string().trim().min(4).max(12),
  clinicId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  sharedGalleryId: z.string().min(1).optional(),
});

// TV'nin gösterdiği kodu girerek cihazı kliniğe bağla. Cihaza özel galeri otomatik açılır.
deviceAdminRouter.post('/bind', async (req, res) => {
  const parsed = bindBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { pairingCode, clinicId, name, sharedGalleryId } = parsed.data;

  const device = await prisma.device.findUnique({ where: { pairingCode: pairingCode.toUpperCase() } });
  if (!device || device.status !== 'UNPAIRED') {
    return res.status(404).json({ error: 'invalid_code' });
  }
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) return res.status(404).json({ error: 'clinic_not_found' });

  // İstenirse ortak galeri aynı kliniğe ait ve SHARED olmalı.
  if (sharedGalleryId) {
    const shared = await prisma.gallery.findFirst({
      where: { id: sharedGalleryId, clinicId, kind: 'SHARED' },
    });
    if (!shared) return res.status(404).json({ error: 'shared_gallery_not_found' });
  }

  const ownGallery = await prisma.gallery.create({
    data: { clinicId, kind: 'DEVICE', name: `${name} – galeri` },
  });

  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      clinicId,
      name,
      status: 'PAIRED',
      ownGalleryId: ownGallery.id,
      sharedGalleryId: sharedGalleryId ?? null,
      // pairingCode temizlenir (tekrar bağlanamaz); pairingSecret korunur ki
      // TV'nin poll'u cihaz token'ını alabilsin.
      pairingCode: null,
    },
  });
  res.json({ id: updated.id, name: updated.name, status: updated.status, ownGalleryId: ownGallery.id });
});

const updateBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  // null gönderilirse ortak galeri ataması kaldırılır.
  sharedGalleryId: z.string().min(1).nullable().optional(),
});

deviceAdminRouter.patch('/:id', async (req, res) => {
  const parsed = updateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const device = await prisma.device.findUnique({ where: { id: req.params.id } });
  if (!device) return res.status(404).json({ error: 'not_found' });

  if (parsed.data.sharedGalleryId) {
    const shared = await prisma.gallery.findFirst({
      where: { id: parsed.data.sharedGalleryId, clinicId: device.clinicId ?? '', kind: 'SHARED' },
    });
    if (!shared) return res.status(404).json({ error: 'shared_gallery_not_found' });
  }
  await prisma.device.update({ where: { id: device.id }, data: parsed.data });
  res.json({ ok: true });
});

// Anlık senkron tetikle: bağlı TV'nin long-poll'unu hemen uyandırır → cihaz içeriği tazeler.
deviceAdminRouter.post('/:id/sync', async (req, res) => {
  const device = await prisma.device.findUnique({ where: { id: req.params.id } });
  if (!device) return res.status(404).json({ error: 'not_found' });
  if (device.status !== 'PAIRED') return res.status(409).json({ error: 'not_paired' });
  triggerSync(device.id);
  res.json({ ok: true });
});

// Cihazı sil. Cihaza özel galerisi de silinir (ownGallery).
deviceAdminRouter.delete('/:id', async (req, res) => {
  const device = await prisma.device.findUnique({ where: { id: req.params.id } });
  if (!device) return res.status(404).json({ error: 'not_found' });
  await prisma.device.delete({ where: { id: device.id } });
  if (device.ownGalleryId) {
    await prisma.gallery.delete({ where: { id: device.ownGalleryId } }).catch(() => {});
  }
  res.json({ ok: true });
});
