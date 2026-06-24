import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';

// Marka kilidi (logo + isim). Gradyanlı kare + wordmark — modern streaming app başlığı.
export function Brand({ size = 'md', tagline }: { size?: 'sm' | 'md' | 'lg'; tagline?: string }) {
  const mark = size === 'lg' ? 64 : size === 'sm' ? 40 : 52;
  const name = size === 'lg' ? 40 : size === 'sm' ? 26 : 32;

  return (
    <View style={styles.row}>
      <View style={[styles.mark, { width: mark, height: mark, borderRadius: mark * 0.28 }]}>
        <Svg width={mark} height={mark} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="brandMark" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.gradientStart} />
              <Stop offset="1" stopColor={colors.gradientMid} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={mark} height={mark} rx={mark * 0.28} fill="url(#brandMark)" />
        </Svg>
        <Text style={[styles.markGlyph, { fontSize: mark * 0.5 }]}>▶</Text>
      </View>
      <View>
        <Text style={[styles.name, { fontSize: name }]}>
          Media TV <Text style={{ color: colors.primary }}>Displayer</Text>
        </Text>
        {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mark: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowColor: colors.primary, shadowOpacity: 0.6, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  markGlyph: { color: colors.primaryForeground, fontWeight: '900', marginLeft: 4 },
  name: { color: colors.foreground, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: colors.mutedForeground, fontSize: 15, marginTop: 2, letterSpacing: 2, textTransform: 'uppercase' },
});
