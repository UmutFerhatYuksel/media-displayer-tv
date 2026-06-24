import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, findNodeHandle, useTVEventHandler,
} from 'react-native';
import { GradientBackground } from '../components/GradientBackground';
import { Brand } from '../components/Brand';
import { colors, radius, spacing, glow } from '../theme';

type Action = 'play' | 'gallery' | 'watchlists' | 'qr' | 'logout';

const ITEMS: { key: Action; label: string; icon: string; title: string; desc: string; cta: string }[] = [
  {
    key: 'play', label: 'Oynat', icon: '▶',
    title: 'Oynatmayı başlat',
    desc: 'Varsayılan oynatma listeni tam ekran, kesintisiz olarak göster.',
    cta: 'OK ile başlat',
  },
  {
    key: 'gallery', label: 'Galeri', icon: '▦',
    title: 'Galeri',
    desc: 'Eklediğin tüm fotoğraf ve videolar burada. Seç, isim ver, watchlist oluştur.',
    cta: 'OK ile galeriyi aç',
  },
  {
    key: 'watchlists', label: 'Watchlistler', icon: '☰',
    title: 'Watchlistler',
    desc: 'Kayıtlı listelerinden birini seç ve hemen oynatmaya başla.',
    cta: 'OK ile listeleri aç',
  },
  {
    key: 'qr', label: 'Telefondan ekle', icon: '⧉',
    title: 'Telefondan QR ile ekle',
    desc: 'Telefonunla kodu okut, foto ve videoları anında TV listene gönder.',
    cta: 'OK ile QR oluştur',
  },
  {
    key: 'logout', label: 'Çıkış', icon: '✕',
    title: 'Çıkış yap',
    desc: 'Bu cihazdaki oturumunu güvenle kapat.',
    cta: 'OK ile çıkış yap',
  },
];

// NOT: Bu react-native-tvos sürümünde Pressable/Touchable'ın onFocus prop'u
// Android TV'de ateşlenmiyor. Bunun yerine useTVEventHandler ile gelen global
// 'focus' olaylarını (odaklanan view'in node tag'i ile) dinleyip hangi öğenin
// seçili olduğunu kendimiz takip ediyoruz.

const NavItem = forwardRef<View, {
  label: string; icon: string; focused: boolean; autoFocus?: boolean; danger?: boolean; onPress: () => void;
}>(({ label, icon, focused, autoFocus, danger, onPress }, ref) => (
  <Pressable
    ref={ref}
    hasTVPreferredFocus={autoFocus}
    onPress={onPress}
    style={[styles.navItem, focused && styles.navItemFocused]}
  >
    <View style={[styles.navBadge, focused && styles.navBadgeFocused]}>
      <Text style={[styles.navIcon, danger && { color: colors.destructive }]}>{icon}</Text>
    </View>
    <Text style={[styles.navLabel, focused && styles.navLabelFocused]} numberOfLines={1}>
      {label}
    </Text>
  </Pressable>
));

export function HomeScreen({ onSelect }: { onSelect: (a: Action) => void }) {
  const cardRefs = useRef<Array<View | null>>([]);
  const tagToIndex = useRef<Record<number, number>>({});
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Her öğenin native view tag'ini index'e eşle (focus olaylarını çözmek için).
  const buildTagMap = useCallback(() => {
    const map: Record<number, number> = {};
    cardRefs.current.forEach((r, i) => {
      const tag = r ? findNodeHandle(r) : null;
      if (tag != null) map[tag] = i;
    });
    tagToIndex.current = map;
  }, []);

  useEffect(() => { buildTagMap(); }, [buildTagMap]);

  useTVEventHandler((evt: any) => {
    if (evt?.eventType !== 'focus' || typeof evt.target !== 'number') return;
    let idx = tagToIndex.current[evt.target];
    if (idx == null) { buildTagMap(); idx = tagToIndex.current[evt.target]; } // ilk seferde harita boşsa kur
    if (idx != null) setFocusedIndex(idx);
  });

  const active = ITEMS[focusedIndex] ?? ITEMS[0];

  return (
    <GradientBackground style={styles.container}>
      {/* Sol: marka + dikey navigasyon rayı */}
      <View style={styles.sidebar}>
        <View style={styles.brandWrap}>
          <Brand size="md" tagline="asistan 7/24" />
        </View>
        <View style={styles.nav}>
          {ITEMS.map((item, i) => (
            <NavItem
              key={item.key}
              ref={(r) => { cardRefs.current[i] = r; }}
              label={item.label}
              icon={item.icon}
              danger={item.key === 'logout'}
              focused={focusedIndex === i}
              autoFocus={i === 0}
              onPress={() => onSelect(item.key)}
            />
          ))}
        </View>
      </View>

      {/* Sağ: odaklanan öğeye göre güncellenen hero panel */}
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Text style={styles.heroIcon}>{active.icon}</Text>
        </View>
        <Text style={styles.heroKicker}>HOŞ GELDİN</Text>
        <Text style={styles.heroTitle}>{active.title}</Text>
        <Text style={styles.heroDesc}>{active.desc}</Text>
        <View style={styles.heroCta}>
          <Text style={styles.heroCtaText}>{active.cta}</Text>
        </View>
      </View>
    </GradientBackground>
  );
}

const SIDEBAR_WIDTH = 440;

const styles = StyleSheet.create({
  // TV overscan'a karşı güvenli iç boşluk — içerik kenarlara yapışmaz.
  container: { flexDirection: 'row', paddingVertical: spacing.lg, paddingHorizontal: spacing.lg },

  // --- sidebar ---
  sidebar: {
    width: SIDEBAR_WIDTH,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center', // dikeyde ortala → 4 öğenin de sığmasını garanti eder
  },
  brandWrap: { marginBottom: spacing.lg, paddingHorizontal: spacing.sm },
  nav: { gap: spacing.xs },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, borderWidth: 2, borderColor: 'transparent',
  },
  navItemFocused: {
    backgroundColor: colors.glassFocused,
    borderColor: colors.ring,
    transform: [{ scale: 1.03 }],
  },
  navBadge: {
    width: 48, height: 48, borderRadius: radius.md,
    backgroundColor: colors.badge, alignItems: 'center', justifyContent: 'center',
  },
  navBadgeFocused: { backgroundColor: 'hsla(22, 85%, 60%, 0.28)' },
  navIcon: { fontSize: 22, color: colors.primary },
  navLabel: { color: colors.mutedForeground, fontSize: 22, fontWeight: '600' },
  navLabelFocused: { color: colors.foreground, fontWeight: '800' },

  // --- hero ---
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  heroBadge: {
    width: 84, height: 84, borderRadius: radius.lg,
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    ...glow, shadowOpacity: 0.35,
  },
  heroIcon: { fontSize: 42, color: colors.primary },
  heroKicker: { color: colors.accent, fontSize: 16, fontWeight: '700', letterSpacing: 6, marginBottom: spacing.sm },
  heroTitle: { color: colors.foreground, fontSize: 52, fontWeight: '800', letterSpacing: 0.5, marginBottom: spacing.sm },
  heroDesc: { color: colors.mutedForeground, fontSize: 22, lineHeight: 32, maxWidth: 680, marginBottom: spacing.md },
  heroCta: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
  },
  heroCtaText: { color: colors.foreground, fontSize: 20, fontWeight: '700' },
});
