import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getOrCreateDefaultPlaylist, buildPlayEntries, URL_TTL } from '../lib/playlist.js';

export const playlistRouter = Router();
playlistRouter.use(requireAuth);

// Kısayol: varsayılan watchlist'i oynat. (Çoklu liste için /watchlists/:id/play kullanılır.)
playlistRouter.get('/', async (req, res) => {
  const playlist = await getOrCreateDefaultPlaylist(req.userId!);
  const items = await buildPlayEntries(playlist.id);
  res.json({
    playlistId: playlist.id,
    name: playlist.name,
    urlTtlSec: URL_TTL,
    loop: playlist.loop,
    shuffle: playlist.shuffle,
    imageDurationSec: playlist.imageDurationSec,
    items,
  });
});
