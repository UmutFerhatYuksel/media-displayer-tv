import React from 'react';
import { StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors } from '../theme';

// Cinematic ambient arka plan: dikey koyu gradyan + iki sıcak ışık kümesi.
// react-native-svg ile çizildiği için ek bağımlılık gerektirmez ve TV'de akıcıdır.
export function GradientBackground({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const { width, height } = useWindowDimensions();

  return (
    <View style={[styles.root, style]}>
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Defs>
          <LinearGradient id="bgBase" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="hsl(20, 40%, 9%)" />
            <Stop offset="0.55" stopColor="hsl(20, 42%, 6%)" />
            <Stop offset="1" stopColor="hsl(18, 48%, 4%)" />
          </LinearGradient>
          <RadialGradient id="glowTop" cx="16%" cy="8%" rx="70%" ry="70%" fx="16%" fy="8%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.30" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowBottom" cx="94%" cy="104%" rx="65%" ry="65%" fx="94%" fy="104%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity="0.18" />
            <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#bgBase)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#glowTop)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#glowBottom)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
