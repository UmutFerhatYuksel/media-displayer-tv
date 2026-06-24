import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { googleRouter } from './routes/google.js';
import { mediaRouter } from './routes/media.js';
import { uploadRouter } from './routes/upload.js';
import { playlistRouter } from './routes/playlists.js';
import { watchlistRouter } from './routes/watchlists.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Telefon yükleme sayfası (login'siz, token'lı): /upload.html
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/google', googleRouter);
app.use('/media', mediaRouter);
app.use('/upload', uploadRouter);
app.use('/playlist', playlistRouter);
app.use('/watchlists', watchlistRouter);

app.listen(config.PORT, () => {
  console.log(`▶ Backend hazır: http://localhost:${config.PORT}`);
});
