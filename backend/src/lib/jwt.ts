import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface SessionClaims {
  sub: string; // User.id
}

// TV oturumu için kendi JWT'miz. 30 gün geçerli; cihaz uzun süre açık kalabilir.
export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies SessionClaims, config.JWT_SECRET, {
    expiresIn: '30d',
  });
}

export function verifySession(token: string): SessionClaims {
  return jwt.verify(token, config.JWT_SECRET) as SessionClaims;
}
