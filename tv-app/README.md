# TV App (Android TV / `react-native-tvos`)

Bu klasörde uygulamanın **JS/TS kaynağı** hazır (`App.tsx`, `index.js`, `src/`).
Çalıştırmak için bir kez **native Android projesini** üretmen gerekir — Android TV
SDK'sı ve bir emülatör/cihaz şart olduğundan bu adım sende, lokalde yapılır.

## 1. Gereksinimler

- Node 20+, JDK 17, Android Studio
- Android SDK + bir **Android TV** emülatörü (AVD: "Television" kategorisi) veya gerçek bir Android TV cihazı (Geliştirici modu + ADB)

## 2. Native projeyi üret ve bu kaynakları bağla

`react-native-tvos` ayrı bir native şablon kullanır. En temiz yol: geçici bir klasörde
tvos şablonuyla proje oluştur, `android/` (ve istersen `ios/`) klasörünü buraya taşı.

```bash
# Geçici bir yerde tvos şablonuyla iskelet üret
npx react-native@npm:react-native-tvos init MediaTvTmp --template react-native-tvos

# Üretilen android/ klasörünü bu tv-app/ içine kopyala
#   MediaTvTmp/android  ->  tv-app/android
# (App.tsx, index.js, src/, package.json BURADAKİLER kalsın — şablondakileri kullanma)
```

Sonra bağımlılıkları kur:

```bash
cd tv-app
npm install
```

## 3. Android TV ayarları (`android/app/src/main/AndroidManifest.xml`)

Uygulamanın TV ana ekranında görünmesi için:

```xml
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
<uses-feature android:name="android.software.leanback" android:required="true" />

<application ... android:banner="@drawable/banner">
  <activity ... >
    <intent-filter>
      <action android:name="android.intent.action.MAIN" />
      <!-- TV ana ekranı için ŞART: -->
      <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
    </intent-filter>
  </activity>
</application>
```

> `@drawable/banner` = 320x180 px TV banner görseli (Play Store / launcher için gerekir).

## 4. Native modüller

`package.json`'daki şu paketler native bağ içerir; autolinking çoğunu halleder:

- `react-native-video` — ExoPlayer ile video oynatma (Android TV'de sorunsuz).
- `react-native-svg` + `react-native-qrcode-svg` — QR kodu çizimi.
- `@react-native-async-storage/async-storage` — oturum token saklama.

Kurulumdan sonra gerekiyorsa: `cd android && ./gradlew clean`.

## 5. Backend adresini ayarla

[src/config.ts](src/config.ts) içindeki `API_BASE_URL`:

- **Emülatör** host makineyi `http://10.0.2.2:4000` ile görür.
- **Gerçek cihaz** aynı ağdaki bilgisayarının LAN IP'sini kullan: `http://192.168.x.x:4000`.
- QR ile telefon yükleme için backend'in `PUBLIC_BASE_URL`'i de telefonun erişebileceği
  bir adres olmalı (LAN IP veya tünel). `localhost` telefondan çalışmaz.

> Geliştirmede cleartext (http) için Android'de `android:usesCleartextTraffic="true"`
> gerekebilir. Üretimde HTTPS kullan.

## 6. Çalıştır

```bash
# Önce backend ayakta olmalı (../backend: npm run dev)
npm run android     # TV emülatörü/cihazı açıkken
```

## Akış

1. İlk açılışta **giriş ekranı**: TV `google.com/device` + bir kod gösterir; telefondan onayla.
   (Aynı Google hesabıyla giren tüm TV'ler aynı medya/watchlist'leri paylaşır.)
2. **Menü**: Oynat (varsayılan) / Watchlistler / Telefondan QR ile ekle / Çıkış.
3. **Watchlistler** → bir liste seç → o liste **loop**'ta oynar (görsel süreli, video tam uzunluk).
4. **QR ile ekle** → telefonla okut, foto/video gönder; medya varsayılan listeye düşer.

## Bilinen sınırlamalar (v1)

- **Google Photos/Drive import şimdilik kapalı** (login dışı hassas scope istememek için).
  Backend kodu (`/google/*`, `/media/import`) ve TV ekranı (`AddFromGoogleScreen`) duruyor;
  açmak için `backend/src/config.ts`'teki `GOOGLE_SCOPES`'a photos/drive scope'larını geri ekle.
- Watchlist **oluşturma/öğe ekleme/sıralama** endpoint'leri backend'de hazır
  (`/watchlists*`) ama TV'de şu an sadece **seçip oynatma** ekranı var; düzenleme UI'si eklenecek.
- Medya tek tek seçim yerine listeye toplu eklenir (TV'de kumandayla seçim zahmetli).
