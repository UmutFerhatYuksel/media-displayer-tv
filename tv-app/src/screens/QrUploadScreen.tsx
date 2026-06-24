import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { createUploadSession } from '../api';
import { GradientBackground } from '../components/GradientBackground';
import { FocusButton } from '../components/FocusButton';
import { colors, radius, spacing, glow } from '../theme';

export function QrUploadScreen({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createUploadSession()
      .then((s) => setUrl(s.uploadUrl))
      .catch(() => setError('Yükleme oturumu oluşturulamadı.'));
  }, []);

  return (
    <GradientBackground style={styles.container}>
      <Text style={styles.kicker}>TELEFONDAN GÖNDER</Text>
      <Text style={styles.title}>📱 Telefonla medya gönder</Text>
      <Text style={styles.lead}>Telefon kameranla bu kodu okut, foto/video seç.</Text>

      <View style={styles.qrFrame}>
        <View style={styles.qrBox}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : url ? (
            <QRCode value={url} size={360} backgroundColor="#ffffff" color="#1a0f0a" />
          ) : (
            <ActivityIndicator size="large" color={colors.primary} />
          )}
        </View>
      </View>

      <Text style={styles.hint}>Gönderilen medya otomatik olarak listeye eklenir.</Text>
      <FocusButton label="‹ Menüye dön" onPress={onDone} autoFocus style={styles.back} />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  kicker: { color: colors.accent, fontSize: 15, fontWeight: '700', letterSpacing: 5, marginBottom: spacing.xs },
  title: { color: colors.foreground, fontSize: 38, fontWeight: '800', marginBottom: spacing.sm },
  lead: { color: colors.mutedForeground, fontSize: 20, marginBottom: spacing.lg },
  qrFrame: {
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.xl, padding: spacing.md,
    ...glow, shadowOpacity: 0.3,
  },
  qrBox: {
    backgroundColor: '#fff', padding: spacing.md, borderRadius: radius.lg,
    minWidth: 408, minHeight: 408, alignItems: 'center', justifyContent: 'center',
  },
  error: { color: colors.destructive, fontSize: 18, textAlign: 'center' },
  hint: { color: colors.mutedForeground, fontSize: 18, marginTop: spacing.lg },
  back: { marginTop: spacing.md, alignSelf: 'center' },
});
