import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  useWindowDimensions, BackHandler,
} from 'react-native';
import { listWatchlists, type Watchlist } from '../api';
import { GradientBackground } from '../components/GradientBackground';
import { FocusButton } from '../components/FocusButton';
import { useFocusable } from '../components/useFocusable';
import { WatchlistDetail } from './WatchlistDetail';
import { colors, radius, spacing } from '../theme';

function Row({ label, sub, autoFocus, onPress }: {
  label: string; sub?: string; autoFocus?: boolean; onPress: () => void;
}) {
  const { ref, focused } = useFocusable<View>(autoFocus);
  return (
    <TouchableOpacity
      ref={ref as any}
      activeOpacity={0.9}
      hasTVPreferredFocus={autoFocus}
      onPress={onPress}
      style={[styles.row, focused && styles.rowFocused]}
    >
      <Text style={[styles.rowText, focused && styles.rowTextFocused]}>{label}</Text>
      {sub ? <Text style={styles.count}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export function WatchlistsScreen({ onPlay, onBack }: {
  onPlay: (watchlistId: string) => void; onBack: () => void;
}) {
  const { height } = useWindowDimensions();
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Watchlist | null>(null); // açık watchlist detayı

  const refresh = useCallback(() => {
    listWatchlists()
      .then((r) => setLists(r.watchlists))
      .catch(() => setError('Listeler alınamadı.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Detay açıkken GERİ önce detayı kapatsın (menüye dönmesin). App.tsx'ten
  // sonra kaydolduğu için önce çalışır.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (detail) { setDetail(null); refresh(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [detail, refresh]);

  if (detail) {
    return (
      <WatchlistDetail
        watchlist={detail}
        onBack={() => { setDetail(null); refresh(); }}
        onPlay={onPlay}
        onChanged={refresh}
      />
    );
  }

  // Liste için açık yükseklik (kolon içinde flex:1 FlatList çöktüğü için).
  const listHeight = Math.max(200, height - 280);

  return (
    <GradientBackground style={styles.container}>
      <Text style={styles.kicker}>KİTAPLIK</Text>
      <Text style={styles.title}>Watchlist seç</Text>
      <Text style={styles.lead}>Bir listeyi aç: içeriğini gör, ayarla, oynat.</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(l) => l.id}
          style={{ height: listHeight }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Row
              label={`${item.isDefault ? '⭐  ' : '☰  '}${item.name}`}
              sub={`${item.itemCount} öğe`}
              autoFocus={index === 0}
              onPress={() => setDetail(item)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>Henüz watchlist yok.</Text>}
        />
      )}

      <FocusButton label="‹ Menüye dön" onPress={onBack} style={styles.back} />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.accent, fontSize: 15, fontWeight: '700', letterSpacing: 5 },
  title: { color: colors.foreground, fontSize: 44, fontWeight: '800', marginTop: spacing.xs },
  lead: { color: colors.mutedForeground, fontSize: 20, marginBottom: spacing.lg, marginTop: spacing.xs },
  error: { color: colors.destructive, fontSize: 18, marginBottom: spacing.sm },
  empty: { color: colors.mutedForeground, fontSize: 18 },
  list: { paddingBottom: spacing.md },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.glass, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, marginBottom: spacing.sm,
    borderWidth: 2, borderColor: colors.glassBorder,
  },
  rowFocused: { backgroundColor: colors.glassFocused, borderColor: colors.ring, transform: [{ scale: 1.015 }] },
  rowText: { color: colors.foreground, fontSize: 26, fontWeight: '600' },
  rowTextFocused: { fontWeight: '800' },
  count: { color: colors.mutedForeground, fontSize: 18 },
  back: { marginTop: 'auto', paddingTop: spacing.md },
});
