import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { PairScreen } from './src/screens/PairScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { loadDeviceToken, clearDeviceToken } from './src/storage';
import { GradientBackground } from './src/components/GradientBackground';
import { colors } from './src/theme';

type Screen = 'loading' | 'pair' | 'player';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    loadDeviceToken().then((t) => setScreen(t ? 'player' : 'pair'));
  }, []);

  if (screen === 'loading') {
    return (
      <GradientBackground style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </GradientBackground>
    );
  }
  if (screen === 'pair') {
    return <PairScreen onPaired={() => setScreen('player')} />;
  }
  return (
    <PlayerScreen
      onUnpaired={async () => {
        await clearDeviceToken();
        setScreen('pair');
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
