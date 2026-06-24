import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpegStatic from 'ffmpeg-static';
import { putObject } from './r2.js';

// ffmpeg-static default export'u runtime'da binary yoludur (string); tip olarak
// modül namespace'i görünüyor, bu yüzden açıkça string'e daraltıyoruz.
const FFMPEG = ffmpegStatic as unknown as string | null;

// Seek edilebilir bir DOSYADAN tek JPEG kare üretir. Dosya kullanmak şart:
// telefon MP4'lerinde moov atom dosya sonunda olabilir; pipe (geri saramayan)
// üzerinden ffmpeg moov'u okuyamaz. -ss girişten önce → hızlı seek.
function extractFrameFromFile(path: string, seekSec: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error('ffmpeg binary not found'));
    const args = [
      '-ss', String(seekSec),
      '-i', path,
      '-frames:v', '1',
      '-vf', 'scale=640:-2', // 640px genişlik, en-boy korunur (çift yükseklik)
      '-f', 'mjpeg',
      'pipe:1',
    ];
    const ff = spawn(FFMPEG, args);
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.stderr.resume(); // stderr'i drain et (dolup bloklamasın)
    ff.on('error', reject);
    ff.on('close', () => resolve(Buffer.concat(chunks)));
  });
}

// Video buffer'ından JPEG önizleme karesi üretir. 1. saniyeden dener, kısa
// video ise ilk kareye düşer. Hata/boşsa null. Geçici dosyayı her hâlde siler.
export async function videoThumbnail(input: Buffer): Promise<Buffer | null> {
  const path = join(tmpdir(), `thumb-${randomUUID()}.bin`);
  try {
    await writeFile(path, input);
    let jpeg = await extractFrameFromFile(path, 1);
    if (jpeg.length === 0) jpeg = await extractFrameFromFile(path, 0);
    return jpeg.length > 0 ? jpeg : null;
  } catch {
    return null;
  } finally {
    await unlink(path).catch(() => {});
  }
}

// Video buffer'ından thumbnail üretip R2'ye yükler; thumb anahtarını döndürür.
// Başarısız olursa null (önizleme zorunlu değil, akışı bozmamalı).
export async function generateAndStoreThumb(
  videoBuffer: Buffer,
  videoKey: string,
): Promise<string | null> {
  const jpeg = await videoThumbnail(videoBuffer);
  if (!jpeg) return null;
  const thumbKey = `${videoKey}.thumb.jpg`;
  try {
    await putObject(thumbKey, jpeg, 'image/jpeg');
    return thumbKey;
  } catch {
    return null;
  }
}
