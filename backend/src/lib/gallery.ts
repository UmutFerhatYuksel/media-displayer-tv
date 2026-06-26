import { prisma } from '../db.js';
import { signedGetUrl } from './r2.js';
import type { Gallery } from '@prisma/client';

export const URL_TTL = 3600; // imzalı oynatma URL'i ömrü (sn)

// İçeriğin üstüne bindirilen banner (reklam görseli) — konum/boyut ekran oranına göre 0..1.
export interface Overlay {
  id: string; // overlay görselinin MediaItem id'si (TV tarafında cache anahtarı)
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayEntry {
  galleryItemId: string;
  mediaId: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl: string | null;
  originalName: string | null;
  durationSec: number;
  width: number | null;
  height: number | null;
  // Overlay: altta kayan yazı + banner görseli (ikisi de opsiyonel).
  tickerText: string | null;
  tickerColor: string | null;
  tickerOpacity: number | null;
  tickerBgColor: string | null;
  tickerBgOpacity: number | null;
  overlay: Overlay | null;
}

// Bir galerinin sıralı, oynatılabilir öğelerini imzalı URL'lerle döndür.
export async function buildGalleryEntries(galleryId: string): Promise<PlayEntry[]> {
  const items = await prisma.galleryItem.findMany({
    where: { galleryId, mediaItem: { status: 'READY' } },
    orderBy: { position: 'asc' },
    include: { mediaItem: true, overlayImage: true },
  });
  const entries = await Promise.all(
    items.map(async (it) => {
      const overlay: Overlay | null =
        it.overlayImage?.r2Key
          ? {
              id: it.overlayImage.id,
              url: await signedGetUrl(it.overlayImage.r2Key, URL_TTL),
              x: it.overlayX ?? 0.72,
              y: it.overlayY ?? 0.72,
              w: it.overlayW ?? 0.22,
              h: it.overlayH ?? 0.18,
            }
          : null;
      return {
        galleryItemId: it.id,
        mediaId: it.mediaItem.id,
        type: it.mediaItem.type,
        url: it.mediaItem.r2Key ? await signedGetUrl(it.mediaItem.r2Key, URL_TTL) : null,
        thumbnailUrl: it.mediaItem.thumbKey ? await signedGetUrl(it.mediaItem.thumbKey, URL_TTL) : null,
        originalName: it.mediaItem.originalName,
        durationSec: it.durationSec,
        width: it.mediaItem.width,
        height: it.mediaItem.height,
        tickerText: it.tickerText ?? null,
        tickerColor: it.tickerColor ?? null,
        tickerOpacity: it.tickerOpacity ?? null,
        tickerBgColor: it.tickerBgColor ?? null,
        tickerBgOpacity: it.tickerBgOpacity ?? null,
        overlay,
      };
    }),
  );
  return entries.filter((e): e is PlayEntry => e.url !== null);
}

export interface DevicePlaylist {
  loop: boolean;
  shuffle: boolean;
  imageDurationSec: number;
  urlTtlSec: number;
  // içerik değişimini ucuz algılamak için (TV koşullu poll yapar)
  revision: string;
  items: PlayEntry[];
}

// Cihazın oynatacağı birleşik liste: önce ortak (shared) galeri, sonra cihaza özel (own) galeri.
// Oynatma ayarları cihazın kendi galerisinden (yoksa ortak galeriden) gelir.
export async function buildDevicePlaylist(
  ownGallery: Gallery | null,
  sharedGallery: Gallery | null,
): Promise<DevicePlaylist> {
  const [sharedItems, ownItems] = await Promise.all([
    sharedGallery ? buildGalleryEntries(sharedGallery.id) : Promise.resolve([]),
    ownGallery ? buildGalleryEntries(ownGallery.id) : Promise.resolve([]),
  ]);
  const cfg = ownGallery ?? sharedGallery;
  const items = [...sharedItems, ...ownItems];
  // Revision: öğe + süre + overlay/ticker imzası. İmzalı URL hariç (her seferinde değişir).
  const revision = items
    .map((e) => {
      const o = e.overlay ? `${e.overlay.x},${e.overlay.y},${e.overlay.w},${e.overlay.h}` : '';
      const t = `${e.tickerText ?? ''}~${e.tickerColor ?? ''}~${e.tickerOpacity ?? ''}~${e.tickerBgColor ?? ''}~${e.tickerBgOpacity ?? ''}`;
      return `${e.galleryItemId}:${e.durationSec}:${t}:${o}`;
    })
    .join('|');
  return {
    loop: cfg?.loop ?? true,
    shuffle: cfg?.shuffle ?? false,
    imageDurationSec: cfg?.imageDurationSec ?? 8,
    urlTtlSec: URL_TTL,
    revision,
    items,
  };
}

// Bir galerinin sonundaki pozisyonu bul (yeni öğe eklerken).
export async function nextPosition(galleryId: string): Promise<number> {
  const last = await prisma.galleryItem.findFirst({
    where: { galleryId },
    orderBy: { position: 'desc' },
  });
  return (last?.position ?? -1) + 1;
}
