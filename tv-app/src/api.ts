import { API_BASE_URL } from './config';
import { loadToken } from './storage';

async function req<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as any) };
  if (auth) {
    const token = await loadToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()) as T;
}

// --- Auth (device flow) ---
export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  intervalSec: number;
  expiresInSec: number;
}
export const deviceStart = () => req<DeviceStart>('/auth/device/start', { method: 'POST' }, false);

export type DevicePoll =
  | { status: 'pending' | 'slow_down' | 'expired' | 'denied' }
  | { status: 'ok'; token: string; user: { id: string; email: string; name?: string; avatarUrl?: string } };
export const devicePoll = (deviceCode: string) =>
  req<DevicePoll>('/auth/device/poll', { method: 'POST', body: JSON.stringify({ deviceCode }) }, false);

// --- Playlist ---
export interface PlaylistEntry {
  playlistItemId: string;
  mediaId: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string | null;
  originalName?: string | null;
  durationSec: number;
  width?: number;
  height?: number;
}
export interface PlaylistResponse {
  playlistId: string;
  name: string;
  urlTtlSec: number;
  loop?: boolean;
  shuffle?: boolean;
  imageDurationSec?: number;
  items: PlaylistEntry[];
}
export const getPlaylist = () => req<PlaylistResponse>('/playlist');

// --- Watchlist'ler (çoklu isimli liste) ---
export interface Watchlist {
  id: string; name: string; isDefault: boolean; itemCount: number;
  loop: boolean; shuffle: boolean; imageDurationSec: number;
}
export const listWatchlists = () => req<{ watchlists: Watchlist[] }>('/watchlists');
export const createWatchlist = (name: string) =>
  req<Watchlist>('/watchlists', { method: 'POST', body: JSON.stringify({ name }) });
export const getWatchlistPlay = (id: string) =>
  req<PlaylistResponse & { name: string }>(`/watchlists/${id}/play`);
// Bir medyayı watchlist'in sonuna ekle.
export const addWatchlistItem = (watchlistId: string, mediaId: string) =>
  req<{ ok: boolean; playlistItemId: string }>(`/watchlists/${watchlistId}/items`, {
    method: 'POST',
    body: JSON.stringify({ mediaId }),
  });

// Oynatma (loop) ayarlarını güncelle.
export interface WatchlistSettings { loop?: boolean; shuffle?: boolean; imageDurationSec?: number }
export const updateWatchlistSettings = (id: string, settings: WatchlistSettings) =>
  req<{ ok: boolean }>(`/watchlists/${id}/settings`, { method: 'PATCH', body: JSON.stringify(settings) });
// Listeden öğe çıkar.
export const removeWatchlistItem = (id: string, itemId: string) =>
  req<{ ok: boolean }>(`/watchlists/${id}/items/${itemId}`, { method: 'DELETE' });
// Öğe sırasını güncelle (playlistItemId dizisi yeni sıra).
export const reorderWatchlist = (id: string, orderedPlaylistItemIds: string[]) =>
  req<{ ok: boolean }>(`/watchlists/${id}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ orderedPlaylistItemIds }),
  });

// --- Google kaynakları ---
export interface PhotosAlbum { id: string; title: string; mediaItemsCount?: string }
export const listAlbums = () => req<{ albums: PhotosAlbum[] }>('/google/photos/albums');

export interface PickItem { id: string; filename?: string; name?: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }
export const listAlbumItems = (albumId: string) =>
  req<{ items: PickItem[] }>(`/google/photos/albums/${albumId}/items`);
export const listDriveFiles = () => req<{ files: PickItem[] }>('/google/drive/files');

export const importMedia = (body: { source: 'GOOGLE_PHOTOS' | 'GOOGLE_DRIVE'; albumId?: string; ids: string[] }) =>
  req<{ importedCount: number; ids: string[] }>('/media/import', { method: 'POST', body: JSON.stringify(body) });

// --- QR yükleme oturumu ---
export const createUploadSession = () =>
  req<{ token: string; uploadUrl: string; expiresAt: string }>('/upload/session', { method: 'POST' });

// --- Medya yönetimi ---
export interface MediaItem {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  originalName?: string | null;
  status: string;
  width?: number | null;
  height?: number | null;
  // galeri önizlemesi için kısa ömürlü imzalı URL (READY değilse null)
  url?: string | null;
  // video önizleme karesi (imzalı URL); görsellerde/üretilemezse null
  thumbnailUrl?: string | null;
}
export const listMedia = () => req<{ items: MediaItem[] }>('/media');
export const deletePlaylistItem = (id: string) =>
  req<{ ok: boolean }>(`/playlist/item/${id}`, { method: 'DELETE' });
