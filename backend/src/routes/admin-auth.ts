import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { signAdmin } from '../lib/jwt.js';
import { requireAdmin } from '../middleware/auth.js';

export const adminAuthRouter = Router();

const credBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(80).optional(),
});

// Yeni admin oluştur. (Tüm adminler eşit yetkili; davet/kayıt için.)
adminAuthRouter.post('/register', async (req, res) => {
  const parsed = credBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { email, password, name } = parsed.data;

  const exists = await prisma.admin.findUnique({ where: { email } });
  if (exists) return res.status(409).json({ error: 'email_taken' });

  const admin = await prisma.admin.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), name },
  });
  const token = signAdmin(admin.id);
  res.status(201).json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
});

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

adminAuthRouter.post('/login', async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_request' });
  const { email, password } = parsed.data;

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  const token = signAdmin(admin.id);
  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
});

adminAuthRouter.get('/me', requireAdmin, async (req, res) => {
  const admin = await prisma.admin.findUnique({ where: { id: req.adminId! } });
  if (!admin) return res.status(404).json({ error: 'not_found' });
  res.json({ id: admin.id, email: admin.email, name: admin.name });
});
