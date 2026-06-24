import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { buildPlayEntries, URL_TTL } from '../lib/playlist.js';

export const watchlistRouter = Router();
watchlistRouter.use(requireAuth);

// Kullanıcının tüm watchlist'leri + öğe sayıları.
watchlistRouter.get('/', async (req, res) => {
  const lists = await prisma.playlist.findMany({
    where: { userId: req.userId! },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { items: true } } },
  });
  res.json({
    watchlists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      isDefault: l.isDefault,
      itemCount: l._count.items,
      loop: l.loop,
      shuffle: l.shuffle,
      imageDurationSec: l.imageDurationSec,
    })),
  });
});

const settingsBody = z.object({
  loop: z.boolean().optional(),
  shuffle: z.boolean().optional(),
  imageDurationSec: z.number().int().min(1).max(600).optional(),
});

// Oynatma (loop) ayarlarını güncelle.
watchlistRouter.patch('/:id/settings', async (req, res) => {
  const parsed = settingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const result = await prisma.playlist.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: parsed.data,
  });
  if (result.count === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

const nameBody = z.object({ name: z.string().trim().min(1).max(80) });

// Yeni watchlist oluştur.
watchlistRouter.post('/', async (req, res) => {
  const parsed = nameBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const list = await prisma.playlist.create({
    data: { userId: req.userId!, name: parsed.data.name, isDefault: false },
  });
  res.status(201).json({ id: list.id, name: list.name, isDefault: false, itemCount: 0 });
});

// Yeniden adlandır.
watchlistRouter.patch('/:id', async (req, res) => {
  const parsed = nameBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const result = await prisma.playlist.updateMany({
    where: { id: req.params.id, userId: req.userId! },
    data: { name: parsed.data.name },
  });
  if (result.count === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// Sil (varsayılan liste silinemez).
watchlistRouter.delete('/:id', async (req, res) => {
  const list = await prisma.playlist.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'not_found' });
  if (list.isDefault) return res.status(400).json({ error: 'cannot_delete_default' });
  await prisma.playlist.delete({ where: { id: list.id } });
  res.json({ ok: true });
});

// TV bunu oynatır: seçilen listenin sıralı öğeleri + imzalı URL'ler.
watchlistRouter.get('/:id/play', async (req, res) => {
  const list = await prisma.playlist.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'not_found' });
  const items = await buildPlayEntries(list.id);
  res.json({
    playlistId: list.id,
    name: list.name,
    urlTtlSec: URL_TTL,
    loop: list.loop,
    shuffle: list.shuffle,
    imageDurationSec: list.imageDurationSec,
    items,
  });
});

const addBody = z.object({ mediaId: z.string().min(1), durationSec: z.number().int().min(1).max(600).optional() });

// Listeye medya ekle (sona).
watchlistRouter.post('/:id/items', async (req, res) => {
  const parsed = addBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const list = await prisma.playlist.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'not_found' });

  // Medya bu kullanıcıya mı ait?
  const media = await prisma.mediaItem.findFirst({ where: { id: parsed.data.mediaId, userId: req.userId! } });
  if (!media) return res.status(404).json({ error: 'media_not_found' });

  const existing = await prisma.playlistItem.findUnique({
    where: { playlistId_mediaItemId: { playlistId: list.id, mediaItemId: media.id } },
  });
  if (existing) return res.json({ ok: true, playlistItemId: existing.id });

  const last = await prisma.playlistItem.findFirst({
    where: { playlistId: list.id }, orderBy: { position: 'desc' },
  });
  const item = await prisma.playlistItem.create({
    data: {
      playlistId: list.id, mediaItemId: media.id,
      position: (last?.position ?? -1) + 1,
      ...(parsed.data.durationSec ? { durationSec: parsed.data.durationSec } : {}),
    },
  });
  res.status(201).json({ ok: true, playlistItemId: item.id });
});

// Listeden öğe çıkar.
watchlistRouter.delete('/:id/items/:itemId', async (req, res) => {
  const list = await prisma.playlist.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'not_found' });
  await prisma.playlistItem.deleteMany({ where: { id: req.params.itemId, playlistId: list.id } });
  res.json({ ok: true });
});

const reorderBody = z.object({ orderedPlaylistItemIds: z.array(z.string()).min(1) });

// Sıralamayı güncelle.
watchlistRouter.put('/:id/reorder', async (req, res) => {
  const parsed = reorderBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const list = await prisma.playlist.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'not_found' });
  await prisma.$transaction(
    parsed.data.orderedPlaylistItemIds.map((id, index) =>
      prisma.playlistItem.updateMany({ where: { id, playlistId: list.id }, data: { position: index } }),
    ),
  );
  res.json({ ok: true });
});

const durationBody = z.object({ durationSec: z.number().int().min(1).max(600) });

// Görselin ekranda kalma süresini güncelle.
watchlistRouter.put('/:id/items/:itemId/duration', async (req, res) => {
  const parsed = durationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const list = await prisma.playlist.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!list) return res.status(404).json({ error: 'not_found' });
  const result = await prisma.playlistItem.updateMany({
    where: { id: req.params.itemId, playlistId: list.id },
    data: { durationSec: parsed.data.durationSec },
  });
  if (result.count === 0) return res.status(404).json({ error: 'item_not_found' });
  res.json({ ok: true });
});
