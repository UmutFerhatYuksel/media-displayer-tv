import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  useWindowDimensions, useTVEventHandler, BackHandler,
} from 'react-native';
import {
  getWatchlistPlay, updateWatchlistSettings, removeWatchlistItem, reorderWatchlist, addWatchlistItem,
  type PlaylistEntry, type Watchlist,
} from '../api';
import { GradientBackground } from '../components/GradientBackground';
import { FocusButton } from '../components/FocusButton';
import { useFocusable } from '../components/useFocusable';
import { MediaPicker } from './MediaPicker';
import { colors, radius, spacing } from '../theme';

const SAFE_H = spacing.xl;
const SAFE_V = spacing.lg;
const DURATIONS = [3, 5, 8, 10, 15, 20]; // görsel süresi seçenekleri (sn)

// Tek öğe satırı. Basılı tut → taşıma modu; OK ile bırak. ✕ ile çıkar.
function ItemRow({ entry, index, grabbed, locked, grabActive, onGrab, onDrop, onRemove }: {
  entry: PlaylistEntry; index: number;
  grabbed: boolean;   // bu satır şu an taşınıyor
  locked: boolean;    // başka satır taşınıyor → bu satır odaklanamaz
  grabActive: boolean; // herhangi bir taşıma aktif → ✕ devre dışı
  onGrab: () => void; onDrop: () => void; onRemove: () => void;
}) {
  const { ref, focused } = useFocusable<View>(false);
  const isVideo = entry.type === 'VIDEO';
  const thumb = isVideo ? entry.thumbnailUrl : entry.url;
  return (
    <View style={[styles.itemRow, focused && styles.itemRowFocused, grabbed && styles.itemRowGrabbed]}>
      <TouchableOpacity
        ref={ref as any}
        activeOpacity={0.9}
        focusable={!locked}
        hasTVPreferredFocus={grabbed}
        onLongPress={grabbed ? undefined : onGrab}
        onPress={grabbed ? onDrop : onGrab}
        style={styles.itemGrab}
        {...({ isTVSelectable: !locked } as any)}
      >
        <View style={styles.thumbWrap}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" resizeMethod="resize" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbIcon}>{isVideo ? '▶' : '🖼'}</Text>
            </View>
          )}
          {isVideo ? <View style={styles.videoTag}><Text style={styles.videoTagText}>VIDEO</Text></View> : null}
        </View>

        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>
            {entry.originalName || (isVideo ? 'Video' : 'Fotoğraf')}
          </Text>
          <Text style={styles.itemMeta}>
            {grabbed ? '↑ / ↓ ile taşı · OK ile bırak' : `${index + 1}. sıra${isVideo ? '' : ` · ${entry.durationSec}sn`}`}
          </Text>
        </View>

        {grabbed ? <Text style={styles.grabHandle}>⠿</Text> : null}
      </TouchableOpacity>

      <FocusButton compact label="✕" variant="secondary" onPress={onRemove} disabled={grabActive} />
    </View>
  );
}

export function WatchlistDetail({ watchlist, onBack, onPlay, onChanged }: {
  watchlist: Watchlist;
  onBack: () => void;
  onPlay: (id: string) => void;
  onChanged: () => void; // üst ekrana değişiklik bildir (sayaç/ayar tazele)
}) {
  const { height } = useWindowDimensions();
  const [items, setItems] = useState<PlaylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loop, setLoop] = useState(watchlist.loop);
  const [shuffle, setShuffle] = useState(watchlist.shuffle);
  const [imageDur, setImageDur] = useState(watchlist.imageDurationSec);
  const [grabbedId, setGrabbedId] = useState<string | null>(null); // taşınan öğe
  const grabbedRef = useRef<string | null>(null); // useTVEventHandler kapanışı için
  const [picking, setPicking] = useState(false); // medya ekleme seçicisi açık mı

  const loadItems = useCallback(() => {
    return getWatchlistPlay(watchlist.id)
      .then((r) => setItems(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [watchlist.id]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Üst kısım kompakt → listeye daha fazla yükseklik (başlık+ayarlar+ipucu+geri ≈ 215px).
  const listHeight = useMemo(() => Math.max(200, height - 215), [height]);

  // --- ayarlar ---
  function toggleLoop() {
    const v = !loop; setLoop(v);
    updateWatchlistSettings(watchlist.id, { loop: v }).then(onChanged).catch(() => setLoop(!v));
  }
  function toggleShuffle() {
    const v = !shuffle; setShuffle(v);
    updateWatchlistSettings(watchlist.id, { shuffle: v }).then(onChanged).catch(() => setShuffle(!v));
  }
  function cycleDuration() {
    const i = DURATIONS.indexOf(imageDur);
    const next = DURATIONS[(i + 1) % DURATIONS.length];
    setImageDur(next);
    updateWatchlistSettings(watchlist.id, { imageDurationSec: next }).then(onChanged).catch(() => setImageDur(imageDur));
  }

  // --- tut & taşı (grab) ---
  const grabbedAtRef = useRef(0);
  function grab(id: string) { grabbedRef.current = id; grabbedAtRef.current = Date.now(); setGrabbedId(id); }
  function drop() {
    if (!grabbedRef.current) return; // zaten bırakılmış (çift tetik koruması)
    grabbedRef.current = null;
    setGrabbedId(null);
    // Güncel sırayı sunucuya yaz.
    setItems((cur) => {
      reorderWatchlist(watchlist.id, cur.map((e) => e.playlistItemId)).then(onChanged).catch(() => {});
      return cur;
    });
  }
  // Taşıma modunda ↑/↓ ile taşınan öğeyi kaydır (yalnızca yerel; bırakınca kaydedilir).
  function moveGrabbed(dir: -1 | 1) {
    setItems((prev) => {
      const idx = prev.findIndex((e) => e.playlistItemId === grabbedRef.current);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function remove(itemId: string) {
    setItems((prev) => prev.filter((e) => e.playlistItemId !== itemId));
    removeWatchlistItem(watchlist.id, itemId).then(onChanged).catch(() => {});
  }

  // Taşıma modunda kumandanın yön tuşlarını yakala (odak kilitli olduğu için
  // başka yere gitmez; biz öğeyi kaydırırız). Tek hareket için release'i atla.
  const lastEvtRef = useRef(0);
  useTVEventHandler((evt: any) => {
    if (!grabbedRef.current) return; // yalnızca taşıma modunda
    const t = evt?.eventType;
    // Taşıma modunda OK/seç → bırak (odak kaybolsa da çalışır). Grab eden basışın
    // select'ini yok say (aksi halde anında bırakır).
    if (t === 'select' || t === 'longSelect') {
      if (Date.now() - grabbedAtRef.current > 350) drop();
      return;
    }
    if (t !== 'up' && t !== 'down' && t !== 'swipeUp' && t !== 'swipeDown') return;
    // Cihaz aynı basış için birden çok olay (down/up) gönderebilir → 150ms debounce.
    const now = Date.now();
    if (now - lastEvtRef.current < 150) return;
    lastEvtRef.current = now;
    moveGrabbed(t === 'up' || t === 'swipeUp' ? -1 : 1);
  });

  // Taşıma modunda GERİ → bırak (detayı kapatma). Aksi halde WatchlistsScreen ele alır.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (grabbedRef.current) { drop(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  // Seçilen medyaları listeye ekle (sona), sonra yenile.
  function addMedia(ids: string[]) {
    Promise.all(ids.map((id) => addWatchlistItem(watchlist.id, id).catch(() => {})))
      .then(() => loadItems())
      .then(onChanged)
      .finally(() => setPicking(false));
  }

  const locked = grabbedId !== null; // taşıma aktifken diğer kontroller kilitli

  // Medya ekleme seçicisi tam ekran açılır.
  if (picking) {
    return (
      <MediaPicker
        existingIds={items.map((e) => e.mediaId)}
        onCancel={() => setPicking(false)}
        onAdd={addMedia}
      />
    );
  }

  return (
    <GradientBackground style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.kicker}>WATCHLIST</Text>
          <Text style={styles.title} numberOfLines={1}>{watchlist.name}</Text>
        </View>
        <FocusButton
          compact
          label="▶  Oynat"
          variant="primary"
          autoFocus
          onPress={() => onPlay(watchlist.id)}
          disabled={items.length === 0 || locked}
        />
      </View>

      {/* Oynatma ayarları (taşıma modunda kilitli) */}
      <View style={styles.settings}>
        <FocusButton compact label={`Döngü: ${loop ? 'Açık' : 'Kapalı'}`} variant={loop ? 'primary' : 'secondary'} onPress={toggleLoop} disabled={locked} />
        <FocusButton compact label={`Karıştır: ${shuffle ? 'Açık' : 'Kapalı'}`} variant={shuffle ? 'primary' : 'secondary'} onPress={toggleShuffle} disabled={locked} />
        <FocusButton compact label={`Görsel süresi: ${imageDur}sn`} variant="secondary" onPress={cycleDuration} disabled={locked} />
      </View>

      <Text style={styles.hint}>
        {locked ? '↑ / ↓ ile taşı · OK ile bırak' : 'Sırayı değiştirmek için bir öğeyi basılı tut'}
      </Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>Bu listede henüz öğe yok.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.playlistItemId}
          style={{ height: listHeight }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const grabbed = grabbedId === item.playlistItemId;
            return (
              <ItemRow
                entry={item}
                index={items.findIndex((e) => e.playlistItemId === item.playlistItemId)}
                grabbed={grabbed}
                locked={locked && !grabbed}
                grabActive={locked}
                onGrab={() => grab(item.playlistItemId)}
                onDrop={drop}
                onRemove={() => remove(item.playlistItemId)}
              />
            );
          }}
          extraData={grabbedId}
        />
      )}

      <FocusButton compact label="‹ Geri" onPress={onBack} style={styles.back} disabled={locked} />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SAFE_H, paddingTop: SAFE_V, paddingBottom: SAFE_V },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  headerLeft: { flex: 1, paddingRight: spacing.lg },
  kicker: { color: colors.accent, fontSize: 13, fontWeight: '700', letterSpacing: 5 },
  title: { color: colors.foreground, fontSize: 28, fontWeight: '800', marginTop: 2 },

  settings: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs, flexWrap: 'wrap' },
  hint: { color: colors.mutedForeground, fontSize: 14, marginBottom: spacing.xs },

  list: { paddingBottom: spacing.lg, paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.glass, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.glassBorder,
    paddingRight: spacing.sm, marginBottom: spacing.sm,
  },
  itemRowFocused: { borderColor: colors.ring },
  itemRowGrabbed: { borderColor: colors.primary, backgroundColor: colors.glassFocused, transform: [{ scale: 1.02 }] },
  itemGrab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.xs, paddingLeft: spacing.sm,
  },
  grabHandle: { color: colors.primary, fontSize: 24, paddingHorizontal: spacing.sm },
  thumbWrap: { width: 84, height: 60, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 28, color: colors.mutedForeground },
  videoTag: {
    position: 'absolute', left: 4, bottom: 4,
    backgroundColor: colors.overlay, borderRadius: radius.sm, paddingVertical: 1, paddingHorizontal: 5,
  },
  videoTagText: { color: colors.foreground, fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  itemInfo: { flex: 1 },
  itemName: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
  itemMeta: { color: colors.mutedForeground, fontSize: 14, marginTop: 2 },

  itemActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },

  empty: { color: colors.mutedForeground, fontSize: 20 },
  back: { marginTop: 'auto', paddingTop: spacing.sm },
});
