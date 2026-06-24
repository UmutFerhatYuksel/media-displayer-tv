// Google Photos Library API — albüm listeleme, albüm içeriği ve orijinal indirme.
const BASE = 'https://photoslibrary.googleapis.com/v1';

export interface PhotosAlbum {
  id: string;
  title: string;
  coverPhotoBaseUrl?: string;
  mediaItemsCount?: string;
}

export interface PhotosMediaItem {
  id: string;
  filename: string;
  mimeType: string;
  baseUrl: string;
  mediaMetadata?: {
    width?: string;
    height?: string;
    video?: unknown; // varsa video
  };
}

export async function listAlbums(accessToken: string): Promise<PhotosAlbum[]> {
  const albums: PhotosAlbum[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${BASE}/albums`);
    url.searchParams.set('pageSize', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`photos albums: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { albums?: PhotosAlbum[]; nextPageToken?: string };
    if (data.albums) albums.push(...data.albums);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return albums;
}

export async function listAlbumItems(accessToken: string, albumId: string): Promise<PhotosMediaItem[]> {
  const items: PhotosMediaItem[] = [];
  let pageToken: string | undefined;
  do {
    const res = await fetch(`${BASE}/mediaItems:search`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ albumId, pageSize: 100, pageToken }),
    });
    if (!res.ok) throw new Error(`photos search: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { mediaItems?: PhotosMediaItem[]; nextPageToken?: string };
    if (data.mediaItems) items.push(...data.mediaItems);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export function isVideo(item: PhotosMediaItem): boolean {
  return !!item.mediaMetadata?.video || item.mimeType.startsWith('video/');
}

// Orijinal kaliteyi indir. Photos: foto için baseUrl + "=d", video için + "=dv".
export async function downloadPhotosItem(item: PhotosMediaItem): Promise<Buffer> {
  const suffix = isVideo(item) ? '=dv' : '=d';
  const res = await fetch(`${item.baseUrl}${suffix}`);
  if (!res.ok) throw new Error(`photos download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
