import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DevicePlaylist } from './api';

// Cihaz token'ı (PAIRED olunca alınır) + eşleştirme bilgisi (poll için).
const TOKEN_KEY = 'device_token';
const PAIR_KEY = 'pairing_state';
// Son bilinen playlist (offline açılışta cache'li öğeleri oynatmak için).
const PLAYLIST_KEY = 'last_playlist';

export async function saveDeviceToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}
export async function loadDeviceToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function clearDeviceToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export interface PairingState {
  deviceId: string;
  pairingSecret: string;
  pairingCode: string;
}
export async function savePairing(state: PairingState) {
  await AsyncStorage.setItem(PAIR_KEY, JSON.stringify(state));
}
export async function loadPairing(): Promise<PairingState | null> {
  const raw = await AsyncStorage.getItem(PAIR_KEY);
  return raw ? (JSON.parse(raw) as PairingState) : null;
}
export async function clearPairing() {
  await AsyncStorage.removeItem(PAIR_KEY);
}

// Playlist metadata'sını sakla (imzalı URL'ler yerine cache'li yerel dosyalardan oynatılır).
export async function savePlaylist(p: DevicePlaylist) {
  await AsyncStorage.setItem(PLAYLIST_KEY, JSON.stringify(p));
}
export async function loadPlaylist(): Promise<DevicePlaylist | null> {
  const raw = await AsyncStorage.getItem(PLAYLIST_KEY);
  return raw ? (JSON.parse(raw) as DevicePlaylist) : null;
}
