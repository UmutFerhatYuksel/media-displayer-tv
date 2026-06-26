import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// İki tür token: panel admin oturumu ve fiziksel cihaz token'ı.
export interface AdminClaims {
  sub: string; // Admin.id
  kind: 'admin';
}
export interface DeviceClaims {
  sub: string; // Device.id
  kind: 'device';
}

// Admin oturumu — panel sekmesi açık kaldığı sürece. 7 gün.
export function signAdmin(adminId: string): string {
  return jwt.sign({ sub: adminId, kind: 'admin' } satisfies AdminClaims, config.JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyAdmin(token: string): AdminClaims {
  const claims = jwt.verify(token, config.JWT_SECRET) as AdminClaims;
  if (claims.kind !== 'admin') throw new Error('not_admin_token');
  return claims;
}

// Cihaz token'ı — TV uzun süre açık kalır, süresizdir (rotasyon panelden sıfırlamayla).
export function signDevice(deviceId: string): string {
  return jwt.sign({ sub: deviceId, kind: 'device' } satisfies DeviceClaims, config.JWT_SECRET);
}

export function verifyDevice(token: string): DeviceClaims {
  const claims = jwt.verify(token, config.JWT_SECRET) as DeviceClaims;
  if (claims.kind !== 'device') throw new Error('not_device_token');
  return claims;
}
