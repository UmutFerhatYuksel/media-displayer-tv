// Mevcut videolar için eksik önizleme karelerini (thumbKey) üretir.
// Çalıştır: npx tsx scripts/backfill-thumbs.ts
import { prisma } from '../src/db.js';
import { getObjectBuffer } from '../src/lib/r2.js';
import { generateAndStoreThumb } from '../src/lib/thumbnail.js';

async function main() {
  const videos = await prisma.mediaItem.findMany({
    where: { type: 'VIDEO', thumbKey: null, r2Key: { not: null } },
  });
  console.log(`${videos.length} video için thumbnail üretilecek.`);
  let ok = 0;
  for (const v of videos) {
    try {
      const buf = await getObjectBuffer(v.r2Key!);
      const thumbKey = await generateAndStoreThumb(buf, v.r2Key!);
      if (thumbKey) {
        await prisma.mediaItem.update({ where: { id: v.id }, data: { thumbKey } });
        ok++;
        console.log(`✓ ${v.id} (${v.originalName ?? ''})`);
      } else {
        console.log(`✗ ${v.id} thumbnail üretilemedi`);
      }
    } catch (e) {
      console.log(`✗ ${v.id} hata:`, (e as Error).message);
    }
  }
  console.log(`Bitti: ${ok}/${videos.length} başarılı.`);
  await prisma.$disconnect();
}

main();
