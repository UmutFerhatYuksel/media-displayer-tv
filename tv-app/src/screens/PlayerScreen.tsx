import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated, Easing, Pressable, useTVEventHandler } from 'react-native';
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
  // Arka planda inen videonun durumu (progress bar için). Aynı anda tek video iner.
  const [dl, setDl] = useState<{ id: string; name: string; frac: number } | null>(null);
  const revision = useRef<string>('');
  const indexRef = useRef(0); // arka plan indiricinin "şu an oynayan" öğeyi önceliklemesi için
  const imageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shuffleInPlace = (list: PlayEntry[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  const applyPlaylistState = useCallback((data: DevicePlaylist, resolved: PlayEntry[]): PlayEntry[] => {
    const list = data.shuffle ? shuffleInPlace(resolved.slice()) : resolved;
    setItems(list);
    setLoop(data.loop);
    setImageDur(data.imageDurationSec);
    setIndex((i) => (i < list.length ? i : 0));
    setLoading(false);
    return list;
  }, []);

  // Arka planda öncelikli + SIRALI indirme: hattı doyurmamak için tek tek iner; her dosya
  // inince listeyi file://'a çevirir. Yeni playlist gelince (revision değişince) bırakır.
  // ÖNCELİK (cache-first ile uyumlu): önce GÖRSELLER (küçük, hemen oynatılır), sonra VİDEOLAR
  // (ağır; inene kadar zaten döngüde atlanıyor). Her grup oynayan öğeden başlayıp döner.
  const cacheInBackground = useCallback(async (rev: string, list: PlayEntry[]) => {
    const n = list.length;
    if (n === 0) return;
    const start = Math.min(indexRef.current, n - 1);
    const rotated = Array.from({ length: n }, (_, k) => list[(start + k) % n]);
    const order = [...rotated.filter((e) => e.type === 'IMAGE'), ...rotated.filter((e) => e.type === 'VIDEO')];
    for (const e of order) {
      if (revision.current !== rev) { setDl(null); return; }
      if (!e.url.startsWith('file')) {
        const isVideo = e.type === 'VIDEO';
        // Video inişini progress bar'da göster; görseller küçük olduğundan göstermeyiz.
        if (isVideo) setDl({ id: e.mediaId, name: e.originalName ?? 'Video', frac: 0 });
        const local = await cacheFile(
          e.mediaId, e.url, isVideo,
          isVideo ? (frac) => setDl((d) => (d && d.id === e.mediaId ? { ...d, frac } : d)) : undefined,
        );
        if (isVideo) setDl((d) => (d && d.id === e.mediaId ? null : d));
        if (revision.current !== rev) { setDl(null); return; }
        if (local) setItems((prev) => prev.map((p) => (p.mediaId === e.mediaId ? { ...p, url: local } : p)));
      }
      const ov = e.overlay;
      if (ov && !ov.url.startsWith('file')) {
        const ovLocal = await cacheFile('ov_' + ov.id, ov.url, false);
        if (revision.current !== rev) return;
        if (ovLocal) setItems((prev) => prev.map((p) => (p.overlay && p.overlay.id === ov.id ? { ...p, overlay: { ...p.overlay, url: ovLocal } } : p)));
      }
    }
  }, []);

  // Çevrimiçi senkron: cache'te olanı hemen file://, olmayanı uzaktan URL ile uygula
  // (indirmeyi BEKLEME) → ekran saniyeler içinde dolar. Sonra arka planda öncelikli indir;
  // bittikçe öğeler otomatik file://'a döner.
  const applyOnline = useCallback(async (data: DevicePlaylist) => {
    await savePlaylist(data);
    const resolved = await Promise.all(
      data.items.map(async (e) => {
        const localMedia = await cachedUri(e.mediaId);
        let overlay = e.overlay ?? null;
        if (overlay) {
          const ov = await cachedUri('ov_' + overlay.id);
          if (ov) overlay = { ...overlay, url: ov };
        }
        return { ...e, url: localMedia ?? e.url, overlay };
      }),
    );
    // Disk temizliği: artık listede olmayan dosyaları sil.
    const keep = new Set<string>();
    data.items.forEach((e) => { keep.add(e.mediaId); if (e.overlay) keep.add('ov_' + e.overlay.id); });
    await prune(keep);
    const list = applyPlaylistState(data, resolved);
    cacheInBackground(data.revision, list).catch(() => {}); // await yok: arka planda iner
  }, [applyPlaylistState, cacheInBackground]);

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
  // Interval yerine jitter'lı self-scheduling timeout: 60 sn ± 0–15 sn rastgele kayma →
  // çok sayıda cihazın aynı anda istek atıp backend/R2'yi tıkamasını (sürü etkisi) dağıtır.
  useEffect(() => {
    let mounted = true;
    let refreshTimer: ReturnType<typeof setTimeout>;
    let hbTimer: ReturnType<typeof setTimeout>;
    const jitter = () => 60 * 1000 + Math.floor(Math.random() * 15 * 1000);
    const scheduleRefresh = () => {
      refreshTimer = setTimeout(async () => { await fetchPlaylist(); if (mounted) scheduleRefresh(); }, jitter());
    };
    const scheduleHb = () => {
      hbTimer = setTimeout(async () => { await heartbeat().catch(() => {}); if (mounted) scheduleHb(); }, jitter());
    };
    (async () => {
      await applyOffline().catch(() => {}); // offline olsa bile ekran anında dolu gelsin
      if (!mounted) return;
      fetchPlaylist();                       // ağ varsa tazele/indir
      scheduleRefresh();
      scheduleHb();
    })();
    return () => {
      mounted = false;
      clearTimeout(refreshTimer);
      clearTimeout(hbTimer);
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
  indexRef.current = index;

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

  // Cache-first: VIDEO yalnızca tamamen indirilmişse (url file://) oynatılır. İnmemiş video,
  // yavaş hatta stream edilip kekelemek yerine döngüde ATLANIR; arka planda inince otomatik
  // oynar. GÖRSEL küçük olduğundan her zaman gösterilir (gerekirse uzaktan yüklenir).
  const isReady = (e?: PlayEntry) => !!e && (e.type === 'IMAGE' || e.url.startsWith('file'));
  const anyReady = items.some(isReady);

  // İnmemiş videoya denk gelince kısa gecikmeyle atla. Hiç hazır öğe yoksa atlama (sonsuz
  // döngü olmasın) — bunun yerine aşağıda "hazırlanıyor" ekranı gösterilir.
  useEffect(() => {
    if (current && current.type === 'VIDEO' && !current.url.startsWith('file') && anyReady) {
      const t = setTimeout(advance, 50);
      return () => clearTimeout(t);
    }
  }, [current, anyReady, advance]);

  // Görsel: kendi süresi (yoksa galeri geneli) kadar bekle. Video (hazır): onEnd ile ilerle.
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
  // Hiç içerik yok VEYA tüm öğeler henüz inmemiş video → duruma göre mesaj.
  if (!items.length || !anyReady) {
    const downloading = items.length > 0;
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>{downloading ? 'İçerik hazırlanıyor…' : 'İçerik bekleniyor…'}</Text>
        <Text style={styles.sub}>{downloading ? 'Video indiriliyor, birazdan başlayacak.' : 'Panelden bu cihaza galeri atayın.'}</Text>
        {dl && <DownloadProgress name={dl.name} frac={dl.frac} big />}
        <Pressable style={StyleSheet.absoluteFill} focusable hasTVPreferredFocus onPress={toggleInfo} />
        {infoVisible && <InfoOverlay info={info} online={serverOnline} />}
      </View>
    );
  }
  // current bir an inmemiş videoya denk geldiyse (atlama efekti birazdan ilerletecek): bu
  // kare için siyah göster — stream etme, kekeleme olmaz.
  if (!isReady(current)) {
    return (
      <View style={styles.center}>
        {dl && <DownloadProgress name={dl.name} frac={dl.frac} />}
        <Pressable style={StyleSheet.absoluteFill} focusable hasTVPreferredFocus onPress={toggleInfo} />
        {infoVisible && <InfoOverlay info={info} online={serverOnline} />}
      </View>
    );
  }

  // Reklam görseli bir kenara yaslanır ve içeriği o kadar küçültür ("squeeze-back").
  // Video kapanmaz; kalan alana sığar. side: kenar, size: o kenarın ekran oranı.
  const ov = current.overlay ?? null;
  // İçerik önce, reklam sonra render edilir; sol/üst kenarda reklamı öne almak için reverse.
  const flexDir: 'row' | 'row-reverse' | 'column' | 'column-reverse' = !ov
    ? 'column'
    : ov.side === 'left' ? 'row-reverse'
    : ov.side === 'right' ? 'row'
    : ov.side === 'top' ? 'column-reverse'
    : 'column'; // bottom
  // Bölmeyi flex oranıyla yapıyoruz (her iki eksende sorunsuz): içerik 1-size, reklam size.
  const contentFlex = ov ? 1 - ov.size : 1;

  return (
    <View style={[styles.stage, { flexDirection: flexDir }]}>
      {/* İçerik (küçülen video/görsel) */}
      <View style={[styles.content, { flexGrow: contentFlex, flexBasis: 0, alignSelf: 'stretch' }]}>
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

        {/* Alt kayan yazı — içerik alanının altında */}
        {current.tickerText ? (
          <Ticker
            text={current.tickerText}
            color={current.tickerColor ?? '#fff'}
            opacity={current.tickerOpacity ?? 1}
            bgColor={current.tickerBgColor ?? '#000'}
            bgOpacity={current.tickerBgOpacity ?? 0.6}
          />
        ) : null}
      </View>

      {/* Reklam şeridi — flex oranıyla aynı eksende pay alır */}
      {ov && (
        <Image
          source={{ uri: ov.url }}
          resizeMode="cover"
          style={{ flexGrow: ov.size, flexBasis: 0, alignSelf: 'stretch' }}
        />
      )}

      {/* Arka planda video inerken küçük ilerleme rozeti (oynatmayı engellemez) */}
      {dl && <DownloadProgress name={dl.name} frac={dl.frac} />}

      {/* OK tuşunu yakalamak için ekranı kaplayan odaklanabilir katman (saydam) */}
      <Pressable style={StyleSheet.absoluteFill} focusable hasTVPreferredFocus onPress={toggleInfo} />

      {infoVisible && <InfoOverlay info={info} online={serverOnline} />}
    </View>
  );
}

// İnen videonun ilerlemesi: köşede küçük rozet (big=false) veya "hazırlanıyor" ekranında
// geniş panel (big=true). Track, yüzde yerine flex oranıyla dolar (DimensionValue gerekmez).
function DownloadProgress({ name, frac, big }: { name: string; frac: number; big?: boolean }) {
  const pct = Math.round(frac * 100);
  return (
    <View style={big ? styles.dlPanel : styles.dlBadge} pointerEvents="none">
      <Text style={big ? styles.dlPanelText : styles.dlBadgeText} numberOfLines={1}>
        ⬇ {name} · %{pct}
      </Text>
      <View style={styles.dlTrack}>
        <View style={[styles.dlFill, { flex: frac }]} />
        <View style={{ flex: 1 - frac }} />
      </View>
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
  content: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
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
  // İndirme ilerleme rozeti (köşe) + geniş panel (hazırlanıyor ekranı)
  dlBadge: {
    position: 'absolute', top: 28, left: 28, minWidth: 300, maxWidth: 520,
    backgroundColor: 'rgba(17,20,28,0.88)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  dlBadgeText: { color: '#e5e9f0', fontSize: 16, marginBottom: 8 },
  dlPanel: { width: 520, maxWidth: '80%', marginTop: 28 },
  dlPanelText: { color: '#e5e9f0', fontSize: 20, marginBottom: 10, textAlign: 'center' },
  dlTrack: {
    flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dlFill: { backgroundColor: '#5b9dff', borderRadius: 3 },
});
