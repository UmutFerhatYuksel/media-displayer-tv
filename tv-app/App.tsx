import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, BackHandler } from 'react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { WatchlistsScreen } from './src/screens/WatchlistsScreen';
import { QrUploadScreen } from './src/screens/QrUploadScreen';
import { GalleryScreen } from './src/screens/GalleryScreen';
import { loadToken, clearToken } from './src/storage';
import { GradientBackground } from './src/components/GradientBackground';
import { colors } from './src/theme';

type Screen = 'loading' | 'login' | 'home' | 'player' | 'watchlists' | 'qr' | 'gallery';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  // Oynatılacak watchlist; undefined → varsayılan liste.
  const [playWatchlistId, setPlayWatchlistId] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadToken().then((t) => setScreen(t ? 'home' : 'login'));
  }, []);

  // Kumandanın GERİ tuşu: alt ekranlardan menüye dön (uygulamadan çıkma).
  // Ana menü/giriş ekranında varsayılan davranış (launcher'a çık) kalır.
  // Not: alt ekranlar kendi GERİ ihtiyaçlarını (örn. açık diyalog) önce işleyebilir;
  // bu handler en sona, yalnızca ekran geçişi için kalır.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'player' || screen === 'watchlists' || screen === 'qr' || screen === 'gallery') {
        setScreen('home');
        return true; // olayı tükettik → uygulama kapanmaz
      }
      return false; // home/login/loading → varsayılan (launcher'a çık)
    });
    return () => sub.remove();
  }, [screen]);

  const logout = useCallback(async () => {
    await clearToken();
    setScreen('login');
  }, []);

  switch (screen) {
    case 'loading':
      return (
        <GradientBackground style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </GradientBackground>
      );
    case 'login':
      return <LoginScreen onLoggedIn={() => setScreen('home')} />;
    case 'home':
      return (
        <HomeScreen
          onSelect={(a) => {
            if (a === 'play') { setPlayWatchlistId(undefined); setScreen('player'); }
            else if (a === 'gallery') setScreen('gallery');
            else if (a === 'watchlists') setScreen('watchlists');
            else if (a === 'qr') setScreen('qr');
            else if (a === 'logout') logout();
          }}
        />
      );
    case 'watchlists':
      return (
        <WatchlistsScreen
          onPlay={(id) => { setPlayWatchlistId(id); setScreen('player'); }}
          onBack={() => setScreen('home')}
        />
      );
    case 'player':
      return <PlayerScreen watchlistId={playWatchlistId} onExit={() => setScreen('home')} />;
    case 'qr':
      return <QrUploadScreen onDone={() => setScreen('home')} />;
    case 'gallery':
      return (
        <GalleryScreen
          onBack={() => setScreen('home')}
          onCreated={(id) => { setPlayWatchlistId(id); setScreen('watchlists'); }}
        />
      );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});
