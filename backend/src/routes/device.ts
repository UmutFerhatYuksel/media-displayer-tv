import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { requireDevice } from '../middleware/auth.js';
import { signDevice } from '../lib/jwt.js';
import { buildDevicePlaylist } from '../lib/gallery.js';
import { waitForSync } from '../lib/syncBus.js';

export const deviceRouter = Router();

const POLL_INTERVAL_SEC = 4;
// Karışması kolay karakterler çıkarıldı (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(len = 6): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

// TV açılışta çağırır: yeni UNPAIRED cihaz + ekranda gösterilecek kod üretir.
deviceRouter.post('/pair/start', async (_req, res) => {
  const pairingSecret = crypto.randomBytes(24).toString('base64url');
  // Benzersiz kod bulana kadar dene (çakışma çok düşük olasılık).
  for (let attempt = 0; attempt < 5; attempt++) {
    const pairingCode = makeCode();
    try {
      const device = await prisma.device.create({
        data: { pairingCode, pairingSecret, status: 'UNPAIRED' },
      });
      return res.json({
        deviceId: device.id,
        pairingCode,
        pairingSecret,
        pollIntervalSec: POLL_INTERVAL_SEC,
      });
    } catch {
      // unique çakışması — tekrar dene
    }
  }
  res.status(500).json({ error: 'code_generation_failed' });
});

const pollBody = z.object({ deviceId: z.string().min(1), pairingSecret: z.string().min(1) });

// TV pollIntervalSec aralıkla çağırır. Panelden bağlanınca cihaz token'ı döner.
deviceRouter.post('/pair/poll', async (req, res) => {
  const parsed = pollBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const device = await prisma.device.findUnique({ where: { id: parsed.data.deviceId } });
  if (!device || device.pairingSecret !== parsed.data.pairingSecret) {
    return res.status(404).json({ error: 'invalid_device' });
  }
  if (device.status !== 'PAIRED') return res.json({ status: 'pending' });

  const token = signDevice(device.id);
  res.json({ status: 'ok', token, name: device.name });
});

// TV oynatma listesini çeker. ?rev= ile koşullu: değişmediyse boş döner (signed URL üretmez).
deviceRouter.get('/playlist', requireDevice, async (req, res) => {
  const device = await prisma.device.findUnique({
    where: { id: req.deviceId! },
    include: { ownGallery: true, sharedGallery: true },
  });
  if (!device) return res.status(404).json({ error: 'not_found' });
  if (device.status !== 'PAIRED') return res.status(409).json({ error: 'not_paired' });

  await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  const playlist = await buildDevicePlaylist(device.ownGallery, device.sharedGallery);
  // İçerik değişmediyse imzalı URL üretmeden erken dön (performans).
  if (typeof req.query.rev === 'string' && req.query.rev === playlist.revision) {
    return res.json({ unchanged: true, revision: playlist.revision });
  }
  res.json({ name: device.name, ...playlist });
});

// TV'nin kendi bilgisini göstermesi için (kumandayla açılan bilgi kutusu).
deviceRouter.get('/me', requireDevice, async (req, res) => {
  const device = await prisma.device.findUnique({
    where: { id: req.deviceId! },
    include: {
      clinic: true,
      ownGallery: { include: { _count: { select: { items: true } } } },
      sharedGallery: { include: { _count: { select: { items: true } } } },
    },
  });
  if (!device) return res.status(404).json({ error: 'not_found' });
  res.json({
    id: device.id,
    name: device.name,
    status: device.status,
    clinic: device.clinic?.name ?? null,
    ownItems: device.ownGallery?._count.items ?? 0,
    sharedItems: device.sharedGallery?._count.items ?? 0,
  });
});

// TV bunu açık tutar (long-poll). Panelden senkron istenince hemen { sync: true } döner,
// aksi halde ~25 sn sonra { sync: false } → TV yeniden bağlanır. Anlık "şimdi senkronla".
deviceRouter.get('/sync-wait', requireDevice, (req, res) => {
  waitForSync(req.deviceId!, res);
});

// TV periyodik çağırır: canlılık + atama değişikliğini öğrenir.
deviceRouter.post('/heartbeat', requireDevice, async (req, res) => {
  const device = await prisma.device.update({
    where: { id: req.deviceId! },
    data: { lastSeenAt: new Date() },
    select: { status: true, name: true, clinicId: true },
  });
  res.json(device);
});
