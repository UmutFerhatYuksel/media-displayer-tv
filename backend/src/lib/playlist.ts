import { prisma } from '../db.js';
import { signedGetUrl } from './r2.js';

export const URL_TTL = 3600; // imzalı oynatma URL'i ömrü (sn)

// Bir playlist'in sıralı, oynatılabilir öğelerini imzalı URL'lerle döndür (TV için).
export async function buildPlayEntries(playlistId: string) {
  const items = await prisma.playlistItem.findMany({
    where: { playlistId, mediaItem: { status: 'READY' } },
    orderBy: { position: 'asc' },
    include: { mediaItem: true },
  });
  const entries = await Promise.all(
    items.map(async (it) => ({
      playlistItemId: it.id,
      mediaId: it.mediaItem.id,
      type: it.mediaItem.type,
      url: it.mediaItem.r2Key ? await signedGetUrl(it.mediaItem.r2Key, URL_TTL) : null,
      // video önizleme karesi (varsa) — detay/galeri için
      thumbnailUrl: it.mediaItem.thumbKey ? await signedGetUrl(it.mediaItem.thumbKey, URL_TTL) : null,
      originalName: it.mediaItem.originalName,
      durationSec: it.durationSec,
      width: it.mediaItem.width,
      height: it.mediaItem.height,
    })),
  );
  return entries.filter((e) => e.url);
}

// Kullanıcının varsayılan playlist'ini getir; yoksa oluştur.
// Birden fazla varsayılan oluşmuşsa (geçmiş yarış durumu) en eskisini deterministik seç.
export async function getOrCreateDefaultPlaylist(userId: string) {
  const existing = await prisma.playlist.findFirst({
    where: { userId, isDefault: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;
  return prisma.playlist.create({ data: { userId, name: 'Varsayılan', isDefault: true } });
}

// Medyayı varsayılan playlist'in sonuna ekle (zaten varsa dokunma).
export async function addToDefaultPlaylist(userId: string, mediaItemId: string) {
  const playlist = await getOrCreateDefaultPlaylist(userId);
  const already = await prisma.playlistItem.findUnique({
    where: { playlistId_mediaItemId: { playlistId: playlist.id, mediaItemId } },
  });
  if (already) return already;

  const last = await prisma.playlistItem.findFirst({
    where: { playlistId: playlist.id },
    orderBy: { position: 'desc' },
  });
  return prisma.playlistItem.create({
    data: { playlistId: playlist.id, mediaItemId, position: (last?.position ?? -1) + 1 },
  });
}
