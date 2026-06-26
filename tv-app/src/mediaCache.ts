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

// Cache'te varsa yerel file:// uri döner; yoksa indirir. İndirme başarısızsa null.
export async function cacheFile(key: string, url: string, isVideo: boolean): Promise<string | null> {
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
  try {
    const res = await FileSystem.downloadAsync(url, tmp);
    if (res.status !== 200) {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
      return null;
    }
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: dest });
    manifest[key] = name;
    await writeManifest(manifest);
    return dest;
  } catch {
    await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
    return null;
  }
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
