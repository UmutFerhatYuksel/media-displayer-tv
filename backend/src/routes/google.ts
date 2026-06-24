import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getValidAccessToken } from '../google/oauth.js';
import { listAlbums, listAlbumItems, isVideo } from '../google/photos.js';
import { listFiles } from '../google/drive.js';

export const googleRouter = Router();
googleRouter.use(requireAuth);

// Photos albümleri (seçim ekranı için).
googleRouter.get('/photos/albums', async (req, res) => {
  try {
    const token = await getValidAccessToken(req.userId!);
    const albums = await listAlbums(token);
    res.json({ albums });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'photos_albums_failed' });
  }
});

// Bir albümün içindeki medya (önizleme + seçim).
googleRouter.get('/photos/albums/:albumId/items', async (req, res) => {
  try {
    const token = await getValidAccessToken(req.userId!);
    const items = await listAlbumItems(token, req.params.albumId);
    res.json({
      items: items.map((i) => ({
        id: i.id,
        filename: i.filename,
        type: isVideo(i) ? 'VIDEO' : 'IMAGE',
        thumbnailUrl: `${i.baseUrl}=w320-h240`,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'photos_items_failed' });
  }
});

// Drive medya dosyaları (opsiyonel klasör filtresi).
googleRouter.get('/drive/files', async (req, res) => {
  try {
    const token = await getValidAccessToken(req.userId!);
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    const files = await listFiles(token, folderId);
    res.json({
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE',
        mimeType: f.mimeType,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'drive_files_failed' });
  }
});
