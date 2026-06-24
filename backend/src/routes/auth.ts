import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import { signSession } from '../lib/jwt.js';
import { startDeviceFlow, pollDeviceFlow, decodeIdToken } from '../google/oauth.js';

export const authRouter = Router();

// TV açılışta çağırır: ekranda gösterilecek user_code + URL'i alır.
authRouter.post('/device/start', async (_req, res) => {
  try {
    const d = await startDeviceFlow();
    res.json({
      deviceCode: d.device_code, // TV bunu poll için saklar
      userCode: d.user_code, // ekranda göster
      verificationUrl: d.verification_url, // ekranda göster (google.com/device)
      intervalSec: d.interval,
      expiresInSec: d.expires_in,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'google_device_start_failed' });
  }
});

const pollBody = z.object({ deviceCode: z.string().min(1) });

// TV intervalSec aralıkla çağırır. Onay gelince kendi JWT'mizi döneriz.
authRouter.post('/device/poll', async (req, res) => {
  const parsed = pollBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

  try {
    const result = await pollDeviceFlow(parsed.data.deviceCode);
    if (result.status !== 'ok') {
      return res.json({ status: result.status }); // pending | slow_down | expired | denied
    }

    const { tokens } = result;
    const profile = decodeIdToken(tokens.id_token);

    // Kullanıcıyı upsert et.
    const user = await prisma.user.upsert({
      where: { googleSub: profile.sub },
      create: {
        googleSub: profile.sub,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.picture,
        playlists: { create: { name: 'Varsayılan', isDefault: true } },
      },
      update: { email: profile.email, name: profile.name, avatarUrl: profile.picture },
    });

    // Google token'larını sakla. refresh_token sadece ilk onayda gelir; yoksa eskiyi koru.
    await prisma.googleToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        refreshToken: encrypt(tokens.refresh_token ?? ''),
        accessToken: encrypt(tokens.access_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
      },
      update: {
        ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
        accessToken: encrypt(tokens.access_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scope: tokens.scope,
      },
    });

    const jwt = signSession(user.id);
    res.json({
      status: 'ok',
      token: jwt,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'google_poll_failed' });
  }
});
