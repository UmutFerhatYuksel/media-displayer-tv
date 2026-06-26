import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, Pressable, useTVEventHandler, type DimensionValue } from 'react-native';
import Video from 'react-native-video';
import { getDevicePlaylist, heartbeat, syncWait, deviceInfo, type PlayEntry, type DevicePlaylist, type DeviceInfo } from '../api';
import { cacheFile, cachedUri, prune } from '../mediaCache';
import { savePlaylist, loadPlaylist } from '../storage';
import { API_BASE_URL } from '../config';

// Cihaz token'ıyla atanmış galeriyi (ortak + cihaza özel) loop oynatır.
// onUnpaired: cihaz panelden silinince/çözülünce eşleştirme ekranına dön.
export function PlayerScreen({ onUnpaired }: { onUnpaired: () => void }) {
  const [items, setItems] = useState<PlayEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loop, setLoop] = useState(true);
  const [imageDur, setImageDur] = useState(8);
  const [serverOnline, setServerOnline] = useState(false);
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const revision = useRef<string>('');
  const imageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shuffleInPlace = (list: PlayEntry[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const applyPlaylistState = useCallback((data: DevicePlaylist, resolved: PlayEntry[]) => {
    const list = data.shuffle ? shuffleInPlace(resolved.slice()) : resolved;
    setItems(list);
    setLoop(data.loop);
    setImageDur(data.imageDurationSec);
    setIndex((i) => (i < list.length ? i : 0));
    setLoading(false);
  }, []);

  // Çevrimiçi senkron: medya + overlay yerel dosyaya indirilir, url'ler file:// olur.
  // İndirilemeyen (ama online olan) öğe uzaktan oynar; sonraki turda tekrar denenir.
  const applyOnline = useCallback(async (data: DevicePlaylist) => {
    await savePlaylist(data);
    const resolved = await Promise.all(
      data.items.map(async (e) => {
        const localMedia = await cacheFile(e.mediaId, e.url, e.type === 'VIDEO');
        let overlay = e.overlay ?? null;
        if (overlay) {
          const ov = await cacheFile('ov_' + overlay.id, overlay.url, false);
          if (ov) overlay = { ...overlay, url: ov };
        }
        return { ...e, url: localMedia ?? e.url, overlay };
      }),
    );
    // Disk temizliği: artık listede olmayan dosyaları sil.
    const keep = new Set<string>();
    data.items.forEach((e) => { keep.add(e.mediaId); if (e.overlay) keep.add('ov_' + e.overlay.id); });
    await prune(keep);
    applyPlaylistState(data, resolved);
  }, [applyPlaylistState]);

  // Çevrimdışı açılış: kalıcı playlist'ten yalnızca cache'li öğeleri oynat (indirme yok).
  const applyOffline = useCallback(async (): Promise<boolean> => {
    const data = await loadPlaylist();
    if (!data) return false;
    const resolved: PlayEntry[] = [];
    for (const e of data.items) {
      const localMedia = await cachedUri(e.mediaId);
      if (!localMedia) continue; // cache'te yoksa offline oynatılamaz, atla
      let overlay = e.overlay ?? null;
      if (overlay) {
        const ov = await cachedUri('ov_' + overlay.id);
        overlay = ov ? { ...overlay, url: ov } : null; // banner cache'te yoksa gizle
      }
      resolved.push({ ...e, url: localMedia, overlay });
    }
    if (resolved.length === 0) return false;
    applyPlaylistState(data, resolved);
    return true;
  }, [applyPlaylistState]);

  // İçerik değişmediyse backend { unchanged: true } döner → yeniden kurmayız.
  const fetchPlaylist = useCallback(async () => {
    try {
      const data = await getDevicePlaylist(revision.current || undefined);
      setServerOnline(true); // istek başarılı → sunucuya ulaşıldı
      if ('unchanged' in data) {
        setLoading(false);
        return;
      }
      revision.current = data.revision;
      await applyOnline(data);
    } catch (e: any) {
      // 409 not_paired → cihaz artık bağlı değil.
      if (String(e?.message ?? '').includes('409')) {
        onUnpaired();
        return;
      }
      // Ağ hatası/kesinti: eldeki (cache'li) içerikle oynatmaya devam et.
      setServerOnline(false);
      setLoading(false);
    }
  }, [applyOnline, onUnpaired]);

  // İlk yükleme (önce cache → sonra ağ) + periyodik yenileme + canlılık (heartbeat).
  useEffect(() => {
    let mounted = true;
    (async () => {
      await applyOffline().catch(() => {}); // offline olsa bile ekran anında dolu gelsin
      if (mounted) fetchPlaylist();          // ağ varsa tazele/indir
    })();
    const refresh = setInterval(fetchPlaylist, 60 * 1000); // 1 dk: içerik değişimi + indirme
    const hb = setInterval(() => { heartbeat().catch(() => {}); }, 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(refresh);
      clearInterval(hb);
    };
  }, [fetchPlaylist, applyOffline]);

  // Panelden "şimdi senkronla" sinyalini long-poll ile dinle → anında tam tazele.
  useEffect(() => {
    let active = true;
    (async () => {
      while (active) {
        try {
          const { sync } = await syncWait();
          if (!active) break;
          if (sync) {
            revision.current = '';   // zorla tam yeniden çek (değişmese de yeniden indir/temizle)
            await fetchPlaylist();
          }
        } catch {
          // ağ yok/hata: kısa bekle, sonra yeniden bağlan
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    })();
    return () => { active = false; };
  }, [fetchPlaylist]);

  // Cihaz bilgisini çek (kumandayla açılan bilgi kutusu için). Ağ varsa güncellenir.
  const refreshInfo = useCallback(async () => {
    try { setInfo(await deviceInfo()); } catch { /* offline: son bilgi kalır */ }
  }, []);
  useEffect(() => { refreshInfo(); }, [refreshInfo]);

  // Kumanda OK → bilgi kutusunu aç/kapat. Açıkken 8 sn sonra otomatik gizle.
  // Not: Android TV'de "select" eventi ancak odaklı bir öğe varken gelir; bu yüzden
  // ekranı kaplayan odaklanabilir bir Pressable kullanıyoruz (aşağıda) + useTVEventHandler (yedek).
  const lastToggle = useRef(0);
  const toggleInfo = useCallback(() => {
    const now = Date.now();
    if (now - lastToggle.current < 400) return; // Pressable + TVEvent çift tetiğini yut
    lastToggle.current = now;
    setInfoVisible((v) => {
      const next = !v;
      if (infoTimer.current) clearTimeout(infoTimer.current);
      if (next) {
        refreshInfo();
        infoTimer.current = setTimeout(() => setInfoVisible(false), 8000);
      }
      return next;
    });
  }, [refreshInfo]);

  useTVEventHandler((evt) => {
    if (evt?.eventType === 'select') toggleInfo();
  });
  useEffect(() => () => { if (infoTimer.current) clearTimeout(infoTimer.current); }, []);

  // advance'in her zaman güncel listeyi görmesi için ref (closure'dan eski uzunluk okumayı önler).
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const advance = useCallback(() => {
    setIndex((i) => {
      const n = itemsRef.current.length;
      if (n === 0) return 0;
      const next = i + 1;
      if (next < n) return next;
      return loop ? 0 : n - 1; // son öğe: loop açıksa başa dön, değilse sonda bekle
    });
  }, [loop]);

  // Liste küçüldüyse index'i sınır içine çek (taşan index → boş render'ı önle).
  useEffect(() => {
    if (index >= items.length && items.length > 0) setIndex(0);
  }, [items.length, index]);

  // index bir an taşsa bile çökmeyelim: ilk öğeye düş (bir sonraki render düzeltir).
  const current = items[index] ?? items[0];

  // Görsel: kendi süresi (yoksa galeri geneli) kadar bekle. Video: onEnd ile ilerle.
  useEffect(() => {
    if (imageTimer.current) clearTimeout(imageTimer.current);
    if (current?.type === 'IMAGE') {
      const dur = current.durationSec || imageDur;
      imageTimer.current = setTimeout(advance, Math.max(1, dur) * 1000);
    }
    return () => {
      if (imageTimer.current) clearTimeout(imageTimer.current);
    };
  }, [current, advance, imageDur]);

  if (loading) {
    return <View style={styles.center}><Text style={styles.msg}>Yükleniyor…</Text></View>;
  }
  if (!items.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>İçerik bekleniyor…</Text>
        <Text style={styles.sub}>Panelden bu cihaza galeri atayın.</Text>
        <Pressable style={StyleSheet.absoluteFill} focusable hasTVPreferredFocus onPress={toggleInfo} />
        {infoVisible && <InfoOverlay info={info} online={serverOnline} />}
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      {current.type === 'IMAGE' ? (
        <Image source={{ uri: current.url }} style={styles.media} resizeMode="contain" />
      ) : (
        <Video
          source={{ uri: current.url }}
          style={styles.media}
          resizeMode="contain"
          paused={false}
          repeat={loop && items.length === 1}
          onEnd={advance}
          onError={advance}
        />
      )}

      {/* Banner (reklam görseli) — konum/boyut ekran oranına göre */}
      {current.overlay && (
        <Image
          source={{ uri: current.overlay.url }}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: `${current.overlay.x * 100}%` as DimensionValue,
            top: `${current.overlay.y * 100}%` as DimensionValue,
            width: `${current.overlay.w * 100}%` as DimensionValue,
            height: `${current.overlay.h * 100}%` as DimensionValue,
          }}
        />
      )}

      {/* Alt kayan yazı */}
      {current.tickerText ? (
        <Ticker
          text={current.tickerText}
          color={current.tickerColor ?? '#fff'}
          opacity={current.tickerOpacity ?? 1}
          bgColor={current.tickerBgColor ?? '#000'}
          bgOpacity={current.tickerBgOpacity ?? 0.6}
        />
      ) : null}

      {/* OK tuşunu yakalamak için ekranı kaplayan odaklanabilir katman (saydam) */}
      <Pressable style={StyleSheet.absoluteFill} focusable hasTVPreferredFocus onPress={toggleInfo} />

      {infoVisible && <InfoOverlay info={info} online={serverOnline} />}
    </View>
  );
}

// Kumandayla açılan cihaz bilgi kutusu (sağ üst köşe).
function InfoOverlay({ info, online }: { info: DeviceInfo | null; online: boolean }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoTitle}>{info?.name ?? 'İsimsiz cihaz'}</Text>
      <View style={styles.infoRow}>
        <View style={[styles.dot, { backgroundColor: online ? '#34d399' : '#f87171' }]} />
        <Text style={styles.infoText}>{online ? 'Sunucuya bağlı' : 'Çevrimdışı (cache)'}</Text>
      </View>
      <Text style={styles.infoText}>Klinik: {info?.clinic ?? '—'}</Text>
      <Text style={styles.infoText}>Durum: {info?.status === 'PAIRED' ? 'Eşleşmiş' : 'Eşleşmemiş'}</Text>
      <Text style={styles.infoText}>
        İçerik: {(info?.ownItems ?? 0) + (info?.sharedItems ?? 0)} öğe
        {info ? `  (cihaz ${info.ownItems} · ortak ${info.sharedItems})` : ''}
      </Text>
      <Text style={styles.infoDim}>Sunucu: {API_BASE_URL}</Text>
      {info?.id ? <Text style={styles.infoDim}>ID: {info.id.slice(0, 10)}…</Text> : null}
      <Text style={styles.infoHint}>Kapatmak için OK'a tekrar bas</Text>
    </View>
  );
}

// #rgb / #rrggbb + opaklık → rgba() (şerit arka planı için)
function hexToRgba(hex: string, opacity: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Sağdan sola sürekli kayan yazı bandı (Animated, native driver).
function Ticker({
  text, color = '#fff', opacity = 1, bgColor = '#000', bgOpacity = 0.6,
}: { text: string; color?: string; opacity?: number; bgColor?: string; bgOpacity?: number }) {
  const tx = useRef(new Animated.Value(0)).current;
  const [barW, setBarW] = useState(0);
  const [textW, setTextW] = useState(0);

  useEffect(() => {
    if (barW === 0 || textW === 0) return;
    tx.setValue(barW);
    const speed = 90; // px/sn
    const anim = Animated.loop(
      Animated.timing(tx, {
        toValue: -textW,
        duration: ((barW + textW) / speed) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [barW, textW, text, tx]);

  return (
    <View style={[styles.tickerBar, { backgroundColor: hexToRgba(bgColor, bgOpacity) }]} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
      <Animated.Text
        numberOfLines={1}
        onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
        style={[styles.tickerText, { color, opacity, transform: [{ translateX: tx }] }]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  msg: { color: '#fff', fontSize: 28 },
  sub: { color: '#9aa3b2', fontSize: 18, marginTop: 12 },
  tickerBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 56,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', overflow: 'hidden',
  },
  tickerText: { position: 'absolute', color: '#fff', fontSize: 28, fontWeight: '600' },
  infoBox: {
    position: 'absolute', top: 32, right: 32, maxWidth: 460,
    backgroundColor: 'rgba(17,20,28,0.92)', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  infoTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  infoText: { color: '#e5e9f0', fontSize: 18, marginTop: 2 },
  infoDim: { color: '#8b93a7', fontSize: 14, marginTop: 6 },
  infoHint: { color: '#6b7280', fontSize: 13, marginTop: 12, fontStyle: 'italic' },
});
