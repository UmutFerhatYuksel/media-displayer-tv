import { API_BASE_URL } from './config';
import { loadDeviceToken } from './storage';

const DEFAULT_TIMEOUT_MS = 15000;

// Yavaş/kopuk hatta isteklerin sonsuza dek asılı kalmasını önle: AbortController ile
// timeout. Long-poll (sync-wait) için çağıran daha uzun bir süre geçirir.
async function req<T>(path: string, opts: RequestInit = {}, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers as any) };
  if (auth) {
    const token = await loadDeviceToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Eşleştirme ---
export interface PairStart {
  deviceId: string;
  pairingCode: string;
  pairingSecret: string;
  pollIntervalSec: number;
}
export const pairStart = () => req<PairStart>('/device/pair/start', { method: 'POST' }, false);

export type PairPoll =
  | { status: 'pending' }
  | { status: 'ok'; token: string; name?: string | null };
export const pairPoll = (deviceId: string, pairingSecret: string) =>
  req<PairPoll>('/device/pair/poll', {
    method: 'POST',
    body: JSON.stringify({ deviceId, pairingSecret }),
  }, false);

// --- Oynatma ---
export type OverlaySide = 'left' | 'right' | 'top' | 'bottom';
export interface Overlay {
  id: string; // overlay görselinin cache anahtarı
  url: string;
  side: OverlaySide; // hangi kenara yaslanır
  size: number;      // o kenarın kapladığı ekran oranı (0..1)
}
export interface PlayEntry {
  galleryItemId: string;
  mediaId: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string | null;
  originalName?: string | null;
  durationSec: number;
  width?: number | null;
  height?: number | null;
  // Overlay: altta kayan yazı + banner görseli
  tickerText?: string | null;
  tickerColor?: string | null;
  tickerOpacity?: number | null;
  tickerBgColor?: string | null;
  tickerBgOpacity?: number | null;
  overlay?: Overlay | null;
}
export interface DevicePlaylist {
  name?: string | null;
  loop: boolean;
  shuffle: boolean;
  imageDurationSec: number;
  urlTtlSec: number;
  revision: string;
  items: PlayEntry[];
}
export type PlaylistResponse = DevicePlaylist | { unchanged: true; revision: string };

// rev verilirse ve içerik aynıysa backend { unchanged: true } döner (signed URL üretmez).
export const getDevicePlaylist = (rev?: string) =>
  req<PlaylistResponse>(`/device/playlist${rev ? `?rev=${encodeURIComponent(rev)}` : ''}`);

export interface Heartbeat {
  status: 'UNPAIRED' | 'PAIRED';
  name?: string | null;
  clinicId?: string | null;
}
export const heartbeat = () => req<Heartbeat>('/device/heartbeat', { method: 'POST' });

export interface DeviceInfo {
  id: string;
  name?: string | null;
  status: 'UNPAIRED' | 'PAIRED';
  clinic?: string | null;
  ownItems: number;
  sharedItems: number;
}
export const deviceInfo = () => req<DeviceInfo>('/device/me');

// Long-poll: backend isteği ~25 sn açık tutar. Panelden "şimdi senkronla" çağrılınca
// hemen { sync: true } döner; aksi halde { sync: false } → TV yeniden bağlanır.
// Backend isteği ~25 sn açık tutar; timeout'u onun üstünde tut (35 sn).
export const syncWait = () => req<{ sync: boolean }>('/device/sync-wait', {}, true, 35000);
