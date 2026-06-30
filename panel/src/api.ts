const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000';

const TOKEN_KEY = 'mediatv_admin_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function req<T>(path: string, opts: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (!(opts.body instanceof FormData)) headers['content-type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    clearToken();
    if (!path.startsWith('/admin/auth')) window.location.href = '/login';
  }
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      code = (await res.json()).error ?? code;
    } catch {
      /* gövde yok */
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

// --- Auth ---
export interface Admin {
  id: string;
  email: string;
  name?: string | null;
}
export const login = (email: string, password: string) =>
  req<{ token: string; admin: Admin }>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
export const getMe = () => req<Admin>('/admin/auth/me');

// --- Klinikler ---
export interface ClinicSummary {
  id: string;
  name: string;
  address?: string | null;
  deviceCount: number;
  galleryCount: number;
  mediaCount: number;
}
export const listClinics = () => req<{ clinics: ClinicSummary[] }>('/clinics');
export const createClinic = (name: string, address?: string) =>
  req<{ id: string }>('/clinics', { method: 'POST', body: JSON.stringify({ name, address }) });
export const deleteClinic = (id: string) => req<{ ok: true }>(`/clinics/${id}`, { method: 'DELETE' });

export interface ClinicDevice {
  id: string;
  name?: string | null;
  status: 'UNPAIRED' | 'PAIRED';
  ownGalleryId?: string | null;
  sharedGalleryId?: string | null;
  sharedGalleryName?: string | null;
  lastSeenAt?: string | null;
}
export interface ClinicGallery {
  id: string;
  kind: 'DEVICE' | 'SHARED';
  name: string;
  itemCount: number;
  loop: boolean;
  shuffle: boolean;
  imageDurationSec: number;
}
export interface ClinicDetail {
  id: string;
  name: string;
  address?: string | null;
  devices: ClinicDevice[];
  galleries: ClinicGallery[];
}
export const getClinic = (id: string) => req<ClinicDetail>(`/clinics/${id}`);

// --- Cihazlar ---
export const bindDevice = (body: {
  pairingCode: string;
  clinicId: string;
  name: string;
  sharedGalleryId?: string;
}) => req<{ id: string }>('/devices/bind', { method: 'POST', body: JSON.stringify(body) });
export const updateDevice = (id: string, body: { name?: string; sharedGalleryId?: string | null }) =>
  req<{ ok: true }>(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteDevice = (id: string) => req<{ ok: true }>(`/devices/${id}`, { method: 'DELETE' });
// Cihaza anlık "şimdi senkronla" sinyali gönder (bağlı TV içeriği hemen tazeler).
export const syncDevice = (id: string) => req<{ ok: true }>(`/devices/${id}/sync`, { method: 'POST' });

// --- Galeriler ---
export const createGallery = (clinicId: string, kind: 'DEVICE' | 'SHARED', name: string) =>
  req<{ id: string }>('/galleries', { method: 'POST', body: JSON.stringify({ clinicId, kind, name }) });
// Havuzdan seçilen medyayı seçilen galerilere topluca ekle (medya havuzda kalır).
export const assignMedia = (galleryIds: string[], mediaIds: string[]) =>
  req<{ ok: true; added: number }>('/galleries/assign', {
    method: 'POST',
    body: JSON.stringify({ galleryIds, mediaIds }),
  });
export const deleteGallery = (id: string) => req<{ ok: true }>(`/galleries/${id}`, { method: 'DELETE' });

export interface GalleryItem {
  galleryItemId: string;
  mediaId: string;
  type: 'IMAGE' | 'VIDEO';
  originalName?: string | null;
  durationSec: number;
  previewUrl?: string | null;
  // Overlay
  tickerText?: string | null;
  tickerColor?: string | null;
  tickerOpacity?: number | null;
  tickerBgColor?: string | null;
  tickerBgOpacity?: number | null;
  overlayImageId?: string | null;
  overlayImageUrl?: string | null;
  overlaySide?: OverlaySide | null;
  overlaySize?: number | null;
}

export type OverlaySide = 'left' | 'right' | 'top' | 'bottom';

export interface OverlayPatch {
  tickerText?: string | null;
  tickerColor?: string | null;
  tickerOpacity?: number;
  tickerBgColor?: string | null;
  tickerBgOpacity?: number;
  overlayImageId?: string | null;
  overlaySide?: OverlaySide;
  overlaySize?: number;
}
export const setItemOverlay = (galleryId: string, itemId: string, body: OverlayPatch) =>
  req<{ ok: true }>(`/galleries/${galleryId}/items/${itemId}/overlay`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
export interface GalleryDetail {
  id: string;
  clinicId: string;
  kind: 'DEVICE' | 'SHARED';
  name: string;
  loop: boolean;
  shuffle: boolean;
  imageDurationSec: number;
  items: GalleryItem[];
}
export const getGallery = (id: string) => req<GalleryDetail>(`/galleries/${id}`);
export const updateGallery = (
  id: string,
  body: { name?: string; loop?: boolean; shuffle?: boolean; imageDurationSec?: number; applyDurationToAll?: boolean },
) => req<{ ok: true }>(`/galleries/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const addGalleryItem = (id: string, mediaId: string) =>
  req<{ ok: true }>(`/galleries/${id}/items`, { method: 'POST', body: JSON.stringify({ mediaId }) });
export const removeGalleryItem = (id: string, itemId: string) =>
  req<{ ok: true }>(`/galleries/${id}/items/${itemId}`, { method: 'DELETE' });
export const reorderGallery = (id: string, orderedItemIds: string[]) =>
  req<{ ok: true }>(`/galleries/${id}/reorder`, { method: 'PUT', body: JSON.stringify({ orderedItemIds }) });
export const setItemDuration = (id: string, itemId: string, durationSec: number) =>
  req<{ ok: true }>(`/galleries/${id}/items/${itemId}/duration`, {
    method: 'PUT',
    body: JSON.stringify({ durationSec }),
  });

// --- Medya ---
export interface MediaItem {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  originalName?: string | null;
  status: string;
  sizeBytes?: number | null;
  previewUrl?: string | null;
}
export const listMedia = (clinicId: string) =>
  req<{ items: MediaItem[] }>(`/media?clinicId=${encodeURIComponent(clinicId)}`);
export const deleteMedia = (id: string) => req<{ ok: true }>(`/media/${id}`, { method: 'DELETE' });

// Doğrudan upload (gövde backend'den geçer). Büyük dosyalar presign akışına yönlendirilebilir.
export async function uploadMedia(clinicId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return req<{ ok: true; mediaId: string }>(`/media/upload?clinicId=${encodeURIComponent(clinicId)}`, {
    method: 'POST',
    body: fd,
  });
}
