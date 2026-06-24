// "asistan 7/24" marka teması (dark) — warm-orange premium SaaS.
// Renkler ana uygulamanın dark-mode HSL token'larıyla birebir eşleşir.
// React Native hsl()/hsla() string'lerini desteklediği için doğrudan kullanılır.

export const colors = {
  background: 'hsl(20, 35%, 8%)', // sıcak koyu zemin
  foreground: 'hsl(30, 25%, 96%)', // ana metin
  card: 'hsl(20, 30%, 11%)', // kart / yüzey
  cardElevated: 'hsl(20, 24%, 15%)', // odaklanınca biraz açılan yüzey
  primary: 'hsl(22, 85%, 60%)', // imza turuncu
  primaryForeground: 'hsl(20, 40%, 10%)', // turuncu üstü metin
  secondary: 'hsl(20, 20%, 16%)',
  muted: 'hsl(20, 20%, 16%)',
  mutedForeground: 'hsl(30, 15%, 65%)', // ikincil metin
  accent: 'hsl(35, 90%, 60%)', // amber vurgu
  destructive: 'hsl(0, 70%, 55%)',
  success: 'hsl(160, 55%, 50%)',
  border: 'hsl(30, 15%, 20%)',
  ring: 'hsl(22, 85%, 60%)', // odak halkası (= primary)
  // marka gradyanı (kırmızı-turuncu → turuncu)
  gradientStart: 'hsl(15, 90%, 55%)',
  gradientMid: 'hsl(25, 95%, 50%)',

  // --- cam / cinematic yüzeyler (modern TV app görünümü) ---
  glass: 'hsla(24, 30%, 16%, 0.55)', // yarı saydam cam kart
  glassBorder: 'hsla(34, 45%, 78%, 0.12)', // ince ışık kenarı
  glassFocused: 'hsla(22, 70%, 24%, 0.75)', // odaklanınca sıcak cam
  overlay: 'hsla(20, 45%, 4%, 0.6)', // koyu örtü
  badge: 'hsla(22, 85%, 60%, 0.15)', // ikon rozeti zemini
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

// Tutarlı boşluk ölçeği — ekranlar arası ritmi korur.
export const spacing = { xs: 8, sm: 12, md: 20, lg: 32, xl: 56, xxl: 80 };

// Sık kullanılan turuncu odak parıltısı (Android: elevation, iOS: shadow*).
export const glow = {
  shadowColor: colors.primary,
  shadowOpacity: 0.55,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 6 },
  elevation: 12,
};
