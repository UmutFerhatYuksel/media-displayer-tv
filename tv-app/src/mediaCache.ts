import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// Medya dosyalarını cihaza indirip yerel oynatma için sakla. İnternet kesik/yavaş olsa
// da oynatma yerel dosyadan sürer. Cache anahtarı medyanın değişmez id'sidir
// (mediaId; overlay görseli için 'ov_' + id) — imzalı URL her seferinde değişse de anahtar sabit.

const DIR = FileSystem.documentDirectory + 'mediacache/';
const MANIFEST_KEY = 'media_cache_manifest';

// cacheKey -> diskteki dosya adı
type Manifest = Record<string, string>;

async function readManifest(): Promise<Manifest> {
  try {
    const raw = await AsyncStorage.getItem(MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as Manifest) : {};
  } catch {
    return {};
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(m));
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

// İndirme URL'inden uzantı çıkar (sorgu parametrelerini at). Bulunamazsa türe göre varsayılan.
function extFromUrl(url: string, isVideo: boolean): string {
  const path = url.split('?')[0];
  const dot = path.lastIndexOf('.');
  if (dot >= 0) {
    const e = path.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{2,4}$/.test(e)) return e;
  }
  return isVideo ? 'mp4' : 'jpg';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Cache'te varsa yerel file:// uri döner; yoksa indirir. İndirme başarısızsa null.
// Yavaş/kopuk hatta dayanıklı: kaldığı yerden devam (resume) + üstel geri çekilmeli retry.
// onProgress: indirme ilerlemesi (0..1) — UI'da progress bar göstermek için (yalnız büyük
// dosyalarda anlamlı). %1'den küçük adımlar gereksiz render olmasın diye atlanır.
export async function cacheFile(
  key: string,
  url: string,
  isVideo: boolean,
  onProgress?: (frac: number) => void,
): Promise<string | null> {
  await ensureDir();
  const manifest = await readManifest();
  const existing = manifest[key];
  if (existing) {
    const uri = DIR + existing;
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) return uri;
  }
  const name = `${key}.${extFromUrl(url, isVideo)}`;
  const dest = DIR + name;
  const tmp = dest + '.tmp';

  // Tek bir resumable indirme: ilk denemede indir, sonraki denemelerde kaldığı yerden
  // devam et (büyük video kopuk hatta baştan başlamaz). 3 deneme, 1s/2s bekleme.
  let lastFrac = -1;
  const cb = onProgress
    ? (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
        if (p.totalBytesExpectedToWrite > 0) {
          const frac = p.totalBytesWritten / p.totalBytesExpectedToWrite;
          if (frac - lastFrac >= 0.01 || frac >= 1) { lastFrac = frac; onProgress(Math.min(1, frac)); }
        }
      }
    : undefined;
  const resumable = FileSystem.createDownloadResumable(url, tmp, {}, cb);
  const MAX = 3;
  for (let attempt = 0; attempt < MAX; attempt++) {
    try {
      const res = attempt === 0 ? await resumable.downloadAsync() : await resumable.resumeAsync();
      if (res && res.status === 200) {
        await FileSystem.deleteAsync(dest, { idempotent: true });
        await FileSystem.moveAsync({ from: tmp, to: dest });
        manifest[key] = name;
        await writeManifest(manifest);
        return dest;
      }
      // 4xx (ör. imzalı URL süresi dolmuş): tekrar denemenin anlamı yok, bir sonraki
      // playlist yenilemesinde taze URL ile yeniden denenir.
      if (res && res.status >= 400 && res.status < 500) break;
    } catch {
      // ağ hatası/timeout: geri çekil, sonra resumeAsync ile devam et.
    }
    if (attempt < MAX - 1) await sleep(1000 * Math.pow(2, attempt));
  }
  await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
  return null;
}

// Çevrimdışı: indirmeden, cache'te varsa yerel uri döner.
export async function cachedUri(key: string): Promise<string | null> {
  const manifest = await readManifest();
  const name = manifest[key];
  if (!name) return null;
  const uri = DIR + name;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? uri : null;
}

// Artık playlist'te olmayan dosyaları sil (disk şişmesini önle).
export async function prune(keepKeys: Set<string>): Promise<void> {
  const manifest = await readManifest();
  let changed = false;
  for (const key of Object.keys(manifest)) {
    if (!keepKeys.has(key)) {
      await FileSystem.deleteAsync(DIR + manifest[key], { idempotent: true }).catch(() => {});
      delete manifest[key];
      changed = true;
    }
  }
  if (changed) await writeManifest(manifest);
}
