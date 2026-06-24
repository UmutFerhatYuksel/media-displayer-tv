import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, useWindowDimensions, BackHandler,
} from 'react-native';
import Video from 'react-native-video';
import { listMedia, createWatchlist, addWatchlistItem, type MediaItem } from '../api';
import { GradientBackground } from '../components/GradientBackground';
import { FocusButton } from '../components/FocusButton';
import { useFocusable } from '../components/useFocusable';
import { colors, radius, spacing, glow } from '../theme';

const COLUMNS = 4;
// TV overscan güvenli kenar payları (1080p'de ~%5). Kenarlardaki karoların
// televizyon çerçevesi altında kesilmesini önler.
const SAFE_H = spacing.xl; // yatay güvenli pay (karo boyutu hesabıyla eşleşir)
const SAFE_V = spacing.lg;
// Grid içi pay: odaklanınca büyüyen (scale) + parıltılı (glow) karoların liste
// kenarında kırpılmaması için. Karolar bu kadar içeriden başlar.
const GRID_PAD = spacing.md;

// Galeri karosu — odak + seçim durumlarıyla.
function Tile({ item, size, selected, selectMode, autoFocus, onPress }: {
  item: MediaItem; size: number; selected: boolean; selectMode: boolean; autoFocus?: boolean; onPress: () => void;
}) {
  const { ref, focused } = useFocusable<View>(autoFocus);
  const isVideo = item.type === 'VIDEO';
  // Görsel için kendi url'i, video için önizleme karesi (thumbnailUrl).
  const thumbSrc = isVideo ? item.thumbnailUrl : item.url;
  return (
    <TouchableOpacity
      ref={ref as any}
      activeOpacity={0.9}
      hasTVPreferredFocus={autoFocus}
      onPress={onPress}
      style={[
        styles.tile,
        { width: size, height: size },
        selected && styles.tileSelected,
        focused && styles.tileFocused,
      ]}
    >
      {thumbSrc ? (
        // resizeMethod="resize": Android'de görseli karo boyutuna göre decode sırasında
        // küçültür → büyük (çok MB'lık) JPEG'ler bellek taşırmadan render olur.
        <Image source={{ uri: thumbSrc }} style={styles.thumb} resizeMode="cover" resizeMethod="resize" />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Text style={styles.placeholderIcon}>{isVideo ? '▶' : '🖼'}</Text>
          {item.originalName ? (
            <Text style={styles.placeholderName} numberOfLines={1}>{item.originalName}</Text>
          ) : null}
        </View>
      )}

      {/* Video: kare üstüne ortalı oynat rozeti + köşe VIDEO etiketi */}
      {isVideo ? (
        <>
          {thumbSrc ? (
            <View style={styles.playOverlay} pointerEvents="none">
              <Text style={styles.playIcon}>▶</Text>
            </View>
          ) : null}
          <View style={styles.videoTag}><Text style={styles.videoTagText}>VIDEO</Text></View>
        </>
      ) : null}

      {/* seçim rozeti — yalnızca seçim modunda */}
      {selectMode ? (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// Tam ekran medya görüntüleyici: foto (contain) veya video (otomatik oynar).
// OK/dokunma ya da GERİ ile kapanır.
function MediaViewer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const isVideo = item.type === 'VIDEO';
  return (
    <View style={styles.viewer}>
      <TouchableOpacity
        style={styles.viewerTouch}
        activeOpacity={1}
        hasTVPreferredFocus
        onPress={onClose}
      >
        {isVideo ? (
          <Video
            source={{ uri: item.url ?? '' }}
            style={styles.viewerMedia}
            resizeMode="contain"
            paused={false}
            repeat
            controls
            onError={onClose}
          />
        ) : (
          <Image source={{ uri: item.url ?? '' }} style={styles.viewerMedia} resizeMode="contain" />
        )}
      </TouchableOpacity>
      <Text style={styles.viewerHint}>Kapatmak için GERİ ya da OK</Text>
    </View>
  );
}

export function GalleryScreen({ onBack, onCreated }: {
  onBack: () => void;
  onCreated: (watchlistId: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false); // false: görüntüle, true: seç
  const [viewing, setViewing] = useState<MediaItem | null>(null); // tam ekran önizleme
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    listMedia()
      .then((r) => setItems(r.items))
      .catch(() => setError('Medya alınamadı.'))
      .finally(() => setLoading(false));
  }, []);

  // GERİ tuşu önceliği: önizleme → isim katmanı → seçim modu. Bu handler
  // App.tsx'tekinden sonra kaydolduğu için önce çalışır; hiçbiri açık değilse
  // App menüye dönüşü ele alır.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewing) { setViewing(null); return true; }
      if (naming) { setNaming(false); return true; }
      if (selectMode) { setSelectMode(false); setSelected(new Set()); return true; }
      return false; // App.tsx menüye dönüşü ele alır
    });
    return () => sub.remove();
  }, [viewing, naming, selectMode]);

  // Karo boyutu: ekran genişliğinden sütun + boşluklara göre hesapla.
  const tileSize = useMemo(() => {
    const horizontalPadding = SAFE_H * 2 + GRID_PAD * 2;
    const gaps = spacing.sm * (COLUMNS - 1);
    return Math.floor((width - horizontalPadding - gaps) / COLUMNS);
  }, [width]);

  // Liste için açık yükseklik: bu react-native-tvos sürümünde kolon içinde
  // flex:1 FlatList 0'a çöküyor; başlık + "Menüye dön" + güvenli paylar için
  // yer ayırıp kalan yüksekliği veriyoruz (kaydırma bu yükseklik içinde çalışır).
  // RESERVED = üst güvenli pay(32) + başlık(~40) + buton(~52) + alt güvenli pay(32).
  // Galeri alanı olabildiğince büyük, "Menüye dön" ekranın dibine yakın kalır.
  const RESERVED = 168;
  const listHeight = Math.max(240, height - RESERVED);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed || selected.size === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const list = await createWatchlist(trimmed);
      // Seçilenleri sırayla ekle (sunucu sona ekler → seçim sırası korunur).
      for (const mediaId of selected) {
        await addWatchlistItem(list.id, mediaId);
      }
      setNaming(false);
      setSaving(false);
      onCreated(list.id);
    } catch {
      setSaving(false);
      setMessage('Watchlist oluşturulamadı.');
    }
  }

  const selectedCount = selected.size;

  return (
    <GradientBackground style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>GALERİ</Text>
        {!selectMode ? (
          // Normal mod: görüntüleme. Buton seçim modunu başlatır.
          items.length > 0 && (
            <FocusButton
              label="✓ Watchlist oluştur"
              variant="primary"
              onPress={() => { setSelected(new Set()); setSelectMode(true); }}
              style={styles.createBtn}
            />
          )
        ) : (
          // Seçim modu: seçilenlerle oluştur ya da iptal.
          <View style={styles.headerBtns}>
            <FocusButton
              label="İptal"
              variant="secondary"
              onPress={() => { setSelectMode(false); setSelected(new Set()); }}
            />
            <FocusButton
              label={`Oluştur (${selectedCount})`}
              variant="primary"
              disabled={selectedCount === 0}
              onPress={() => { setName(''); setMessage(null); setNaming(true); }}
            />
          </View>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Henüz medya yok.</Text>
          <Text style={styles.emptySub}>Telefondan QR ile veya Google'dan medya ekleyince burada görünür.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          numColumns={COLUMNS}
          style={[styles.list, { height: listHeight }]}
          columnWrapperStyle={styles.rowGap}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Tile
              item={item}
              size={tileSize}
              selected={selected.has(item.id)}
              selectMode={selectMode}
              autoFocus={index === 0}
              onPress={() => (selectMode ? toggle(item.id) : setViewing(item))}
            />
          )}
        />
      )}

      <FocusButton label="‹ Menüye dön" onPress={onBack} style={styles.back} />

      {/* İsim verme katmanı */}
      {naming && (
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Watchlist'e isim ver</Text>
            <Text style={styles.dialogSub}>{selectedCount} medya bu listeye eklenecek.</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Örn. Tatil 2026"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoFocus
              hasTVPreferredFocus
              onSubmitEditing={submitCreate}
              returnKeyType="done"
              editable={!saving}
            />
            {message && <Text style={styles.error}>{message}</Text>}
            <View style={styles.dialogRow}>
              <FocusButton label="İptal" variant="secondary" onPress={() => setNaming(false)} disabled={saving} />
              <FocusButton
                label={saving ? 'Oluşturuluyor…' : 'Oluştur'}
                variant="primary"
                onPress={submitCreate}
                disabled={!name.trim() || saving}
              />
            </View>
          </View>
        </View>
      )}

      {/* Tam ekran medya görüntüleyici */}
      {viewing && <MediaViewer item={viewing} onClose={() => setViewing(null)} />}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SAFE_H, paddingTop: SAFE_V, paddingBottom: SAFE_V },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Yükseklik bileşende açıkça veriliyor (listHeight). Sabit bir görüntü alanı
  // → FlatList kaydırılabilir olur ve alt sıralara odakla ulaşılır.
  list: { alignSelf: 'stretch' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.md },
  kicker: { color: colors.accent, fontSize: 15, fontWeight: '700', letterSpacing: 5 },
  title: { color: colors.foreground, fontSize: 40, fontWeight: '800', marginTop: spacing.xs },
  lead: { color: colors.mutedForeground, fontSize: 18, marginTop: 2 },

  createBtn: { alignSelf: 'flex-end' },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  // İç boşluklar: odaklanınca büyüyen (scale) karoların kenarda kesilmemesi için
  // her yönde pay bırakır (sol/sağ kırpılma düzeltmesi).
  grid: { paddingHorizontal: GRID_PAD, paddingTop: GRID_PAD, paddingBottom: spacing.xl },
  rowGap: { gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 3, borderColor: colors.glassBorder, backgroundColor: colors.card,
  },
  tileFocused: { borderColor: colors.ring, transform: [{ scale: 1.04 }] },
  tileSelected: { borderColor: colors.primary },
  thumb: { width: '100%', height: '100%' },
  placeholder: { backgroundColor: colors.cardElevated, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm },
  placeholderIcon: { fontSize: 40, color: colors.mutedForeground },
  placeholderName: { color: colors.mutedForeground, fontSize: 14, textAlign: 'center' },

  videoTag: {
    position: 'absolute', left: 8, bottom: 8,
    backgroundColor: colors.overlay, borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 8,
  },
  videoTagText: { color: colors.foreground, fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Önizleme karesi üstünde ortalı yarı saydam oynat rozeti (video olduğunu belli eder).
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  playIcon: {
    color: '#fff', fontSize: 34, fontWeight: '900',
    width: 72, height: 72, borderRadius: 36, lineHeight: 72, textAlign: 'center',
    paddingLeft: 6, // ▶ optik ortalama
    backgroundColor: 'hsla(20, 45%, 4%, 0.55)', overflow: 'hidden',
  },

  check: {
    position: 'absolute', top: 8, right: 8,
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.primaryForeground, fontSize: 20, fontWeight: '900' },

  // marginTop:'auto' → kolon flex'inde kalan boşluğu yukarı alır, butonu dibe sabitler.
  back: { marginTop: 'auto', paddingTop: spacing.sm },
  error: { color: colors.destructive, fontSize: 18, marginBottom: spacing.sm },
  empty: { color: colors.foreground, fontSize: 24, fontWeight: '700' },
  emptySub: { color: colors.mutedForeground, fontSize: 18, marginTop: spacing.xs, textAlign: 'center', maxWidth: 700 },

  // --- isim katmanı ---
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'hsla(20, 45%, 4%, 0.82)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  dialog: {
    width: 720, maxWidth: '90%',
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.xl,
    padding: spacing.xl, ...glow, shadowOpacity: 0.4,
  },
  dialogTitle: { color: colors.foreground, fontSize: 30, fontWeight: '800' },
  dialogSub: { color: colors.mutedForeground, fontSize: 18, marginTop: spacing.xs, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.background, color: colors.foreground,
    fontSize: 26, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border,
  },
  dialogRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.lg },

  // --- tam ekran görüntüleyici ---
  viewer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 10 },
  viewerTouch: { flex: 1 },
  viewerMedia: { width: '100%', height: '100%' },
  viewerHint: {
    position: 'absolute', bottom: spacing.md, width: '100%', textAlign: 'center',
    color: colors.mutedForeground, fontSize: 16,
  },
});
