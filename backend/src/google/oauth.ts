import { config, GOOGLE_SCOPES } from '../config.js';
import { prisma } from '../db.js';
import { encrypt, decrypt } from '../lib/crypto.js';

const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string; // Google bunu verification_url olarak döner
  expires_in: number;
  interval: number;
}

// 1. Adım: TV için device + user code al.
export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES.join(' '),
    }),
  });
  if (!res.ok) throw new Error(`device/code failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceCodeResponse;
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'ok'; tokens: GoogleTokens };

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token: string;
}

// 2. Adım: kullanıcı onayını bekle (TV periyodik poll eder).
export async function pollDeviceFlow(deviceCode: string): Promise<PollResult> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (res.ok) return { status: 'ok', tokens: data as unknown as GoogleTokens };

  switch (data.error) {
    case 'authorization_pending':
      return { status: 'pending' };
    case 'slow_down':
      return { status: 'slow_down' };
    case 'expired_token':
      return { status: 'expired' };
    case 'access_denied':
      return { status: 'denied' };
    default:
      throw new Error(`token poll error: ${JSON.stringify(data)}`);
  }
}

// id_token'ın payload'unu doğrulamadan çözer (sub/email/name almak için).
// Not: token Google'dan TLS üzerinden geldiği için burada imza doğrulaması atlanır.
export function decodeIdToken(idToken: string): { sub: string; email: string; name?: string; picture?: string } {
  const payload = idToken.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(json);
}

// Kullanıcının geçerli access_token'ını döndür; süresi dolduysa refresh ile yenile.
export async function getValidAccessToken(userId: string): Promise<string> {
  const row = await prisma.googleToken.findUnique({ where: { userId } });
  if (!row) throw new Error('Bu kullanıcı için Google token yok');

  const notExpired = row.accessToken && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000;
  if (notExpired) return decrypt(row.accessToken!);

  const refreshToken = decrypt(row.refreshToken);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };

  await prisma.googleToken.update({
    where: { userId },
    data: {
      accessToken: encrypt(data.access_token),
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}
