import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { listAlbums, listAlbumItems, listDriveFiles, importMedia, type PhotosAlbum } from '../api';
import { GradientBackground } from '../components/GradientBackground';
import { FocusButton } from '../components/FocusButton';
import { useFocusable } from '../components/useFocusable';
import { colors, radius, spacing } from '../theme';

type Status = { busy: boolean; message: string | null };

function Row({ label, sub, highlight, autoFocus, disabled, onPress }: {
  label: string; sub?: string; highlight?: boolean; autoFocus?: boolean; disabled?: boolean; onPress: () => void;
}) {
  const { ref, focused } = useFocusable<View>(autoFocus);
  return (
    <TouchableOpacity
      ref={ref as any}
      activeOpacity={0.9}
      hasTVPreferredFocus={autoFocus}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, highlight && styles.rowHighlight, focused && styles.rowFocused]}
    >
      <Text style={[styles.rowText, focused && styles.rowTextFocused]}>{label}</Text>
      {sub ? <Text style={styles.count}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export function AddFromGoogleScreen({ onDone }: { onDone: () => void }) {
  const [albums, setAlbums] = useState<PhotosAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>({ busy: false, message: null });

  useEffect(() => {
    listAlbums()
      .then((r) => setAlbums(r.albums))
      .catch(() => setStatus({ busy: false, message: 'Albümler alınamadı.' }))
      .finally(() => setLoading(false));
  }, []);

  async function importAlbum(album: PhotosAlbum) {
    setStatus({ busy: true, message: `"${album.title}" içe aktarılıyor…` });
    try {
      const { items } = await listAlbumItems(album.id);
      const ids = items.map((i) => i.id);
      if (!ids.length) { setStatus({ busy: false, message: 'Albüm boş.' }); return; }
      const r = await importMedia({ source: 'GOOGLE_PHOTOS', albumId: album.id, ids });
      setStatus({ busy: false, message: `${r.importedCount} medya eklendi.` });
    } catch {
      setStatus({ busy: false, message: 'İçe aktarma başarısız.' });
    }
  }

  async function importDrive() {
    setStatus({ busy: true, message: 'Drive dosyaları içe aktarılıyor…' });
    try {
      const { files } = await listDriveFiles();
      const ids = files.map((f) => f.id);
      if (!ids.length) { setStatus({ busy: false, message: 'Drive\'da medya bulunamadı.' }); return; }
      const r = await importMedia({ source: 'GOOGLE_DRIVE', ids });
      setStatus({ busy: false, message: `${r.importedCount} medya eklendi.` });
    } catch {
      setStatus({ busy: false, message: 'Drive içe aktarma başarısız.' });
    }
  }

  return (
    <GradientBackground style={styles.container}>
      <Text style={styles.kicker}>İÇE AKTAR</Text>
      <Text style={styles.title}>Google'dan medya ekle</Text>
      {status.message && <Text style={styles.status}>{status.message}</Text>}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={albums}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Row
              label="📁  Google Drive'daki tüm medya"
              highlight
              autoFocus
              disabled={status.busy}
              onPress={importDrive}
            />
          }
          renderItem={({ item }) => (
            <Row
              label={`🖼   ${item.title}`}
              sub={item.mediaItemsCount ? String(item.mediaItemsCount) : undefined}
              disabled={status.busy}
              onPress={() => importAlbum(item)}
            />
          )}
        />
      )}

      <FocusButton label="‹ Menüye dön" onPress={onDone} style={styles.back} />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.accent, fontSize: 15, fontWeight: '700', letterSpacing: 5 },
  title: { color: colors.foreground, fontSize: 44, fontWeight: '800', marginTop: spacing.xs, marginBottom: spacing.md },
  status: { color: colors.accent, fontSize: 18, marginBottom: spacing.md },
  list: { paddingBottom: spacing.md },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.glass, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.lg, marginBottom: spacing.sm,
    borderWidth: 2, borderColor: colors.glassBorder,
  },
  rowHighlight: { backgroundColor: colors.cardElevated },
  rowFocused: { backgroundColor: colors.glassFocused, borderColor: colors.ring, transform: [{ scale: 1.015 }] },
  rowText: { color: colors.foreground, fontSize: 24, fontWeight: '600' },
  rowTextFocused: { fontWeight: '800' },
  count: { color: colors.mutedForeground, fontSize: 18 },
  back: { marginTop: spacing.md },
});
