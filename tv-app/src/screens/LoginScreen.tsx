import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { deviceStart, devicePoll, type DeviceStart } from '../api';
import { saveToken } from '../storage';
import { GradientBackground } from '../components/GradientBackground';
import { Brand } from '../components/Brand';
import { colors, radius, spacing, glow } from '../theme';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [info, setInfo] = useState<DeviceStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function begin() {
      try {
        const start = await deviceStart();
        if (cancelled) return;
        setInfo(start);
        poll(start);
      } catch {
        setError('Giriş başlatılamadı. Backend çalışıyor mu?');
      }
    }

    async function poll(start: DeviceStart) {
      try {
        const r = await devicePoll(start.deviceCode);
        if (cancelled) return;
        if (r.status === 'ok') {
          await saveToken(r.token);
          onLoggedIn();
          return;
        }
        if (r.status === 'expired' || r.status === 'denied') {
          setError(r.status === 'expired' ? 'Kod süresi doldu, yeniden deneyin.' : 'Giriş reddedildi.');
          return;
        }
        const delay = (r.status === 'slow_down' ? start.intervalSec + 5 : start.intervalSec) * 1000;
        timer.current = setTimeout(() => poll(start), delay);
      } catch {
        timer.current = setTimeout(() => poll(start), start.intervalSec * 1000);
      }
    }

    begin();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onLoggedIn]);

  return (
    <GradientBackground style={styles.container}>
      <View style={styles.brandWrap}>
        <Brand size="lg" tagline="asistan 7/24" />
      </View>

      <View style={styles.panel}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : info ? (
          <>
            <Text style={styles.kicker}>CİHAZ GİRİŞİ</Text>
            <Text style={styles.lead}>Telefonundan şu adrese git:</Text>
            <Text style={styles.url}>{info.verificationUrl}</Text>
            <View style={styles.codeBox}>
              <Text style={styles.code} numberOfLines={1} adjustsFontSizeToFit>{info.userCode}</Text>
            </View>
            <Text style={styles.hint}>Onayladığında TV otomatik olarak açılacak.</Text>
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  brandWrap: { marginBottom: spacing.lg },
  panel: {
    alignItems: 'center',
    maxWidth: 920,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.xl,
    ...glow, shadowOpacity: 0.25,
  },
  kicker: { color: colors.accent, fontSize: 16, fontWeight: '700', letterSpacing: 6, marginBottom: spacing.sm },
  lead: { color: colors.mutedForeground, fontSize: 22, marginTop: spacing.sm },
  url: { color: colors.foreground, fontSize: 30, fontWeight: '600', marginTop: spacing.xs },
  codeBox: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.badge,
    borderWidth: 1, borderColor: colors.ring,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  code: { color: colors.primary, fontSize: 60, fontWeight: '800', letterSpacing: 8 },
  hint: { color: colors.mutedForeground, fontSize: 18, marginTop: spacing.md },
  error: { color: colors.destructive, fontSize: 24, textAlign: 'center' },
});
