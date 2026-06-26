import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { prisma } from './db.js';
import { adminAuthRouter } from './routes/admin-auth.js';
import { clinicRouter } from './routes/clinics.js';
import { galleryRouter } from './routes/galleries.js';
import { deviceAdminRouter } from './routes/devices.js';
import { mediaRouter } from './routes/media.js';
import { deviceRouter } from './routes/device.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Panel (admin) API'leri
app.use('/admin/auth', adminAuthRouter);
app.use('/clinics', clinicRouter);
app.use('/galleries', galleryRouter);
app.use('/devices', deviceAdminRouter);
app.use('/media', mediaRouter);

// Cihaz (TV) API'leri
app.use('/device', deviceRouter);

// İlk admin'i tohumla (env doluysa). Tekrar çalıştırmada günceller.
async function bootstrapAdmin() {
  const { ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD } = config;
  if (!ADMIN_BOOTSTRAP_EMAIL || !ADMIN_BOOTSTRAP_PASSWORD) return;
  const passwordHash = await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, 10);
  await prisma.admin.upsert({
    where: { email: ADMIN_BOOTSTRAP_EMAIL },
    create: { email: ADMIN_BOOTSTRAP_EMAIL, passwordHash, name: 'Admin' },
    update: { passwordHash },
  });
  console.log(`✔ Bootstrap admin hazır: ${ADMIN_BOOTSTRAP_EMAIL}`);
}

bootstrapAdmin()
  .catch((err) => console.error('Bootstrap admin hatası:', err))
  .finally(() => {
    app.listen(config.PORT, () => {
      console.log(`▶ Backend hazır: http://localhost:${config.PORT}`);
    });
  });
