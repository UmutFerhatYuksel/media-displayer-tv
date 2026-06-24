import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { useFocusable } from './useFocusable';
import { colors, radius, spacing } from '../theme';

type Variant = 'ghost' | 'primary' | 'secondary';

// TV için görünür odaklı buton: kumandayla odaklanınca turuncu halka + parıltı + büyüme.
// Odak durumu useFocusable ile (global TV focus olaylarından) çıkarılır — bu tvos
// sürümünde onFocus prop'u ateşlenmediği için gereklidir.
export function FocusButton({
  label, onPress, autoFocus, variant = 'ghost', disabled, compact, style,
}: {
  label: string;
  onPress: () => void;
  autoFocus?: boolean;
  variant?: Variant;
  disabled?: boolean;
  compact?: boolean; // daha az dolgu + küçük yazı (dar alanlar için)
  style?: ViewStyle | ViewStyle[];
}) {
  const { ref, focused } = useFocusable<View>(autoFocus);
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      ref={ref as any}
      activeOpacity={0.85}
      hasTVPreferredFocus={autoFocus}
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      {...({ isTVSelectable: !disabled } as any)}
      style={[
        styles.base,
        compact && styles.baseCompact,
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        focused && styles.focused,
        focused && isPrimary && styles.primaryFocused,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          compact && styles.textCompact,
          isPrimary ? styles.primaryText : styles.mutedText,
          focused && !isPrimary && styles.textFocused,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent',
  },
  baseCompact: { paddingVertical: 6, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.secondary },
  focused: {
    backgroundColor: colors.glassFocused,
    borderColor: colors.ring,
    transform: [{ scale: 1.04 }],
  },
  primaryFocused: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
  text: { fontSize: 20, fontWeight: '700' },
  textCompact: { fontSize: 16 },
  mutedText: { color: colors.mutedForeground },
  primaryText: { color: colors.primaryForeground, fontWeight: '800' },
  textFocused: { color: colors.foreground },
});
