# Media TV Displayer

Android TV uygulaması: kullanıcı Google ile giriş yapar, kendi medyalarını (video/görsel)
seçer veya telefonundan QR ile gönderir; TV bunları belirlenen sıra ve sürelerle
**loop'ta** sürekli gösterir. Klasik "digital signage" mantığı, ama tüketici dostu.

## Bileşenler

| Klasör        | Ne                                                                 | Stack                                  |
| ------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `backend/`    | API: auth, Google Photos/Drive import, R2 depolama, playlist       | Node.js + TypeScript, Express, Prisma  |
| `tv-app/`     | Android TV uygulaması (login, medya yönetimi, loop oynatıcı)       | React Native (`react-native-tvos`)     |
| `backend/public/upload.html` | Telefondan QR ile yükleme için login'siz geçici sayfa | Tek dosya HTML/JS                      |

## Akış (özet)

1. TV açılır → backend'den Google **device-flow** kodu alır → ekranda
   `google.com/device → KOD` gösterir.
2. Kullanıcı telefonundan onaylar → backend OAuth token'ı alır, kullanıcı oturumu açılır.
3. Kullanıcı TV'de:
   - **Google Photos/Drive**'dan medya seçer → backend bunları R2'ye kopyalar, **veya**
   - TV'deki **QR**'ı telefonuyla okutup yerel foto/video gönderir → R2'ye yüklenir.
4. Medya bir **playlist**'e dizilir (sıra + her görsel için süre).
5. TV playlist'i çekip R2'den **loop**'ta oynatır (görsel = N sn, video = tam uzunluk).

Detaylı mimari ve veri modeli için [ARCHITECTURE.md](ARCHITECTURE.md).

## Geliştirme

```bash
# Backend
cd backend
cp .env.example .env      # değerleri doldur
npm install
npm run db:push           # Prisma şemasını veritabanına uygula
npm run dev               # http://localhost:4000

# TV app (ayrı terminal)
cd tv-app
npm install
npm run android           # Android TV emülatör / cihaz gerekli
```

## Gerekli dış servisler

- **Cloudflare R2** bucket + API token (S3 uyumlu).
- **PostgreSQL** veritabanı.
- **Google Cloud** projesi: OAuth client (TV/Limited-Input), Photos Library API + Drive API açık.
