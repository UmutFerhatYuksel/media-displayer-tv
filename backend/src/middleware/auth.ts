import type { Request, Response, NextFunction } from 'express';
import { verifyAdmin, verifyDevice } from '../lib/jwt.js';

// Authenticated isteklerde ilgili id set edilir.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminId?: string;
      deviceId?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

// Panel API'leri: geçerli admin JWT'si gerekir.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    req.adminId = verifyAdmin(token).sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

// Cihaz API'leri: geçerli cihaz JWT'si gerekir.
export function requireDevice(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    req.deviceId = verifyDevice(token).sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
