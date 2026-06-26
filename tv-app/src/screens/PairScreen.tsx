import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GradientBackground } from '../components/GradientBackground';
import { Brand } from '../components/Brand';
import { colors, radius, spacing } from '../theme';
import { pairStart, pairPoll } from '../api';
import { savePairing, loadPairing, clearPairing, saveDeviceToken } from '../storage';

// TV açılışta kod gösterir, panelden bağlanmasını bekler. Bağlanınca onPaired().
export function PairScreen({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function begin() {
      try {
        // Daha önce başlatılmış bir eşleştirme varsa kodu koru; yoksa yeni başlat.
        let pairing = await loadPairing();
        if (!pairing) {
          const s = await pairStart();
          pairing = { deviceId: s.deviceId, pairingSecret: s.pairingSecret, pairingCode: s.pairingCode };
          await savePairing(pairing);
        }
        if (cancelled) return;
        setCode(pairing.pairingCode);

        const poll = async () => {
          try {
            const res = await pairPoll(pairing!.deviceId, pairing!.pairingSecret);
            if (res.status === 'ok') {
              await saveDeviceToken(res.token);
              await clearPairing();
              if (timer.current) clearInterval(timer.current);
              if (!cancelled) onPaired();
            }
          } catch {
            // geçici ağ hatası — bir sonraki tur dener
          }
        };
        timer.current = setInterval(poll, 4000);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    begin();
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [onPaired]);

  return (
    <GradientBackground style={styles.root}>
      <Brand />
      <View style={styles.card}>
        <Text style={styles.title}>Cihazı bağla</Text>
        <Text style={styles.sub}>
          Yönetici panelinden bu kodu girerek ekranı bir kliniğe bağlayın.
        </Text>

        {error ? (
          <Text style={styles.error}>Sunucuya ulaşılamadı. Bağlantıyı kontrol edin.</Text>
        ) : code ? (
          <Text style={styles.code}>{code}</Text>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: spacing.lg }} />
        )}

        <Text style={styles.hint}>Bağlantı kurulunca içerik otomatik başlar.</Text>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.glass,
    borderColor: colors.glassBorder,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  title: { color: colors.foreground, fontSize: 34, fontWeight: '700' },
  sub: { color: colors.mutedForeground, fontSize: 20, marginTop: spacing.sm, textAlign: 'center', maxWidth: 640 },
  code: {
    color: colors.primary,
    fontSize: 96,
    fontWeight: '800',
    letterSpacing: 14,
    marginVertical: spacing.lg,
  },
  hint: { color: colors.mutedForeground, fontSize: 16, marginTop: spacing.sm },
  error: { color: colors.destructive, fontSize: 22, marginVertical: spacing.lg, textAlign: 'center' },
});
