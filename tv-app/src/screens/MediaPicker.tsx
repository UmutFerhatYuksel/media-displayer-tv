import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  useWindowDimensions, BackHandler,
} from 'react-native';
import { listMedia, type MediaItem } from '../api';
import { GradientBackground } from '../components/GradientBackground';
import { FocusButton } from '../components/FocusButton';
import { useFocusable } from '../components/useFocusable';
import { colors, radius, spacing } from '../theme';

const COLUMNS = 4;
const SAFE_H = spacing.xl;
const SAFE_V = spacing.lg;
const GRID_PAD = spacing.md;

function PickTile({ item, size, selected, existing, autoFocus, onPress }: {
  item: MediaItem; size: number; selected: boolean; existing: boolean; autoFocus?: boolean; onPress: () => void;
}) {
  const { ref, focused } = useFocusable<View>(autoFocus);
  const isVideo = item.type === 'VIDEO';
  const thumb = isVideo ? item.thumbnailUrl : item.url;
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
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" resizeMethod="resize" />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Text style={styles.placeholderIcon}>{isVideo ? '▶' : '🖼'}</Text>
        </View>
      )}
      {isVideo && thumb ? (
        <View style={styles.playOverlay} pointerEvents="none"><Text style={styles.playIcon}>▶</Text></View>
      ) : null}
      {isVideo ? <View style={styles.videoTag}><Text style={styles.videoTagText}>VIDEO</Text></View> : null}

      {existing ? (
        // Zaten listede: soluk örtü + "Ekli" rozeti, seçilemez.
        <View style={styles.existingOverlay} pointerEvents="none">
          <Text style={styles.existingText}>✓ Ekli</Text>
        </View>
      ) : (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

export function MediaPicker({ existingIds, onCancel, onAdd }: {
  existingIds: string[];
  onCancel: () => void;
  onAdd: (mediaIds: string[]) => void; // seçilen yeni medya id'leri
}) {
  const { width, height } = useWindowDimensions();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const existing = useMemo(() => new Set(existingIds), [existingIds]);

  useEffect(() => {
    listMedia().then((r) => setItems(r.items)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onCancel(); return true; });
    return () => sub.remove();
  }, [onCancel]);

  const tileSize = useMemo(() => {
    const horizontalPadding = SAFE_H * 2 + GRID_PAD * 2;
    const gaps = spacing.sm * (COLUMNS - 1);
    return Math.floor((width - horizontalPadding - gaps) / COLUMNS);
  }, [width]);
  const listHeight = Math.max(200, height - 200);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const count = selected.size;

  return (
    <GradientBackground style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>LİSTEYE EKLE</Text>
        <View style={styles.headerBtns}>
          <FocusButton compact label="İptal" variant="secondary" onPress={onCancel} disabled={saving} />
          <FocusButton
            compact
            label={saving ? 'Ekleniyor…' : `Ekle (${count})`}
            variant="primary"
            disabled={count === 0 || saving}
            onPress={() => { setSaving(true); onAdd(Array.from(selected)); }}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>Henüz medya yok.</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          numColumns={COLUMNS}
          style={{ height: listHeight }}
          columnWrapperStyle={styles.rowGap}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const inList = existing.has(item.id);
            return (
              <PickTile
                item={item}
                size={tileSize}
                selected={selected.has(item.id)}
                existing={inList}
                autoFocus={index === 0}
                onPress={() => { if (!inList) toggle(item.id); }}
              />
            );
          }}
        />
      )}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: SAFE_H, paddingTop: SAFE_V, paddingBottom: SAFE_V },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  kicker: { color: colors.accent, fontSize: 15, fontWeight: '700', letterSpacing: 5 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { color: colors.mutedForeground, fontSize: 20 },

  grid: { paddingHorizontal: GRID_PAD, paddingTop: GRID_PAD, paddingBottom: spacing.xl },
  rowGap: { gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 3, borderColor: colors.glassBorder, backgroundColor: colors.card,
  },
  tileFocused: { borderColor: colors.ring, transform: [{ scale: 1.04 }] },
  tileSelected: { borderColor: colors.primary },
  thumb: { width: '100%', height: '100%' },
  placeholder: { backgroundColor: colors.cardElevated, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 40, color: colors.mutedForeground },

  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playIcon: {
    color: '#fff', fontSize: 30, fontWeight: '900',
    width: 64, height: 64, borderRadius: 32, lineHeight: 64, textAlign: 'center', paddingLeft: 5,
    backgroundColor: 'hsla(20, 45%, 4%, 0.55)', overflow: 'hidden',
  },
  videoTag: {
    position: 'absolute', left: 8, bottom: 8,
    backgroundColor: colors.overlay, borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 8,
  },
  videoTagText: { color: colors.foreground, fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  check: {
    position: 'absolute', top: 8, right: 8,
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.primaryForeground, fontSize: 20, fontWeight: '900' },

  existingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'hsla(20, 45%, 4%, 0.62)',
    alignItems: 'center', justifyContent: 'center',
  },
  existingText: { color: colors.foreground, fontSize: 20, fontWeight: '800' },
});
