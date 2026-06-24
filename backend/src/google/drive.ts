// Google Drive API — görsel/video dosyalarını listele ve indir.
const BASE = 'https://www.googleapis.com/drive/v3';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
  imageMediaMetadata?: { width?: number; height?: number };
}

const MEDIA_QUERY = "(mimeType contains 'image/' or mimeType contains 'video/') and trashed = false";

export async function listFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  const q = folderId ? `'${folderId}' in parents and ${MEDIA_QUERY}` : MEDIA_QUERY;
  do {
    const url = new URL(`${BASE}/files`);
    url.searchParams.set('q', q);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set(
      'fields',
      'nextPageToken, files(id,name,mimeType,size,videoMediaMetadata,imageMediaMetadata)',
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`drive list: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    if (data.files) files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

export async function downloadDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/files/${fileId}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`drive download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
