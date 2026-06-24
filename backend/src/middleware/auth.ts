import type { Request, Response, NextFunction } from 'express';
import { verifySession } from '../lib/jwt.js';

// Authenticated isteklerde req.userId set edilir.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_token' });
  }
  try {
    const claims = verifySession(header.slice('Bearer '.length));
    req.userId = claims.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}
