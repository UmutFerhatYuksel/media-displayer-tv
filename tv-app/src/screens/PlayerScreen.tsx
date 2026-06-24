import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Video from 'react-native-video';
import { getPlaylist, getWatchlistPlay, type PlaylistEntry } from '../api';
import { colors } from '../theme';

// watchlistId verilirse o liste, verilmezse varsayılan liste oynatılır.
export function PlayerScreen({ onExit, watchlistId }: { onExit: () => void; watchlistId?: string }) {
  const [items, setItems] = useState<PlaylistEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loop, setLoop] = useState(true);
  const [imageDur, setImageDur] = useState(8);
  const imageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPlaylist = useCallback(async () => {
    try {
      const data = watchlistId ? await getWatchlistPlay(watchlistId) : await getPlaylist();
      // Karıştır açıksa sırayı rastgele dağıt (kopya üzerinde Fisher–Yates).
      let list = data.items;
      if (data.shuffle) {
        list = data.items.slice();
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
      }
      setItems(list);
      setLoop(data.loop ?? true);
      setImageDur(data.imageDurationSec ?? 8);
      setIndex((i) => (i < list.length ? i : 0));
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [watchlistId]);

  // İlk yükleme + imzalı URL'leri tazelemek için periyodik yenileme.
  useEffect(() => {
    fetchPlaylist();
    const id = setInterval(fetchPlaylist, 5 * 60 * 1000); // 5 dk
    return () => clearInterval(id);
  }, [fetchPlaylist]);

  // Not: kumandanın GERİ tuşu App.tsx'teki merkezi handler'da işlenir (→ menüye dön).

  const advance = useCallback(() => {
    setIndex((i) => {
      if (!items.length) return 0;
      if (i + 1 < items.length) return i + 1;
      // Son öğedeyiz: döngü açıksa başa dön, kapalıysa menüye çık.
      if (loop) return 0;
      onExit();
      return i;
    });
  }, [items.length, loop, onExit]);

  const current = items[index];

  // Görsel ise liste geneli süreden sonra ilerle. Video ise onEnd ile ilerler.
  useEffect(() => {
    if (imageTimer.current) clearTimeout(imageTimer.current);
    if (current?.type === 'IMAGE') {
      imageTimer.current = setTimeout(advance, Math.max(1, imageDur) * 1000);
    }
    return () => {
      if (imageTimer.current) clearTimeout(imageTimer.current);
    };
  }, [current, advance, imageDur]);

  if (loading) {
    return <View style={styles.center}><Text style={styles.msg}>Yükleniyor…</Text></View>;
  }
  if (!items.length) {
    return (
      <TouchableOpacity style={styles.center} onPress={onExit}>
        <Text style={styles.msg}>Henüz medya yok.</Text>
        <Text style={styles.sub}>Menüden Google'dan ekle veya telefonla QR'dan gönder.</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.stage}>
      {current.type === 'IMAGE' ? (
        <Image source={{ uri: current.url }} style={styles.media} resizeMode="contain" />
      ) : (
        <Video
          source={{ uri: current.url }}
          style={styles.media}
          resizeMode="contain"
          paused={false}
          repeat={loop && items.length === 1}
          onEnd={advance}
          onError={advance}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  msg: { color: colors.foreground, fontSize: 28 },
  sub: { color: colors.mutedForeground, fontSize: 18, marginTop: 12 },
});
