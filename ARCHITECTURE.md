# Mimari

## Genel görünüm

```
┌─────────────────────────────┐
│        TV App (RN tvos)      │
│  • Google device-flow login  │     ┌──────────────┐
│  • Photos/Drive'dan seç      │────►│  Backend API │────► Cloudflare R2
│  • QR göster (telefon yükler) │     │  Express+TS  │      (medya dosyaları)
│  • Loop oynatıcı (R2'den)    │◄────│  Prisma      │────► PostgreSQL
└─────────────────────────────┘     └──────┬───────┘
                                            ├──► Google OAuth (device flow)
   ┌──────────────────┐                     ├──► Google Photos Library API
   │ Telefon (QR'dan) │────────────────────►┤    Google Drive API
   │  upload.html     │   tek seferlik token │
   └──────────────────┘
```

**İlke:** TV app ince; tüm Google API ve depolama işleri backend'de. TV yalnızca
kendi backend'imizle konuşur, böylece OAuth sırları sunucuda kalır.

## Kimlik doğrulama

### TV'de giriş — Google OAuth Device Flow
Android TV'de klavye zahmetli olduğu için Google'ın
"OAuth 2.0 for TV and Limited-Input Devices" akışını kullanırız:

1. TV → `POST /auth/device/start` → backend Google'dan `device_code` + `user_code` alır,
   TV'ye `user_code` ("ABCD-1234") ve `verification_url` döner.
2. TV ekranda gösterir; kullanıcı telefondan `google.com/device` → kodu girer → onaylar.
3. TV → `POST /auth/device/poll` ile bekler; onay gelince backend `access_token` +
   `refresh_token` alır, `User` kaydını upsert eder, **kendi JWT'mizi** TV'ye döner.
4. TV bu JWT'yi saklar; sonraki tüm isteklerde `Authorization: Bearer <jwt>` gönderir.

Google `refresh_token` veritabanında (şifreli) saklanır — Photos/Drive'a backend bu
token'la erişir. TV bizim JWT'mizi kullanır, Google token'ını asla görmez.

İstenen scope'lar: `openid email profile`,
`https://www.googleapis.com/auth/photoslibrary.readonly`,
`https://www.googleapis.com/auth/drive.readonly`.

## Medya girişi (iki yol)

### A) Google Photos / Drive'dan seçme
1. TV → `GET /google/photos/albums` veya `/google/drive/files` → backend kullanıcının
   token'ıyla listeyi getirir.
2. Kullanıcı seçer → TV → `POST /media/import` (kaynak + id listesi).
3. Backend her öğeyi Google'dan indirip **R2'ye** koyar, `MediaItem` kaydı oluşturur
   (tip, boyut, süre/oran, R2 key). İndirme async kuyrukta da olabilir.

### B) Telefondan QR ile yükleme
1. TV → `POST /upload/session` → tek seferlik token + URL döner; TV bunu **QR** yapar.
2. Kullanıcı telefonuyla QR'ı okutur → `upload.html?token=...` açılır (login yok).
3. Sayfa dosyaları → `POST /upload/file` (token'lı) → backend doğrudan R2'ye yazar,
   `MediaItem` oluşturur ve oturumun sahibine bağlar.
4. Oturum süreli ve tek kullanıcılıktır; medya o TV kullanıcısının hesabına düşer.

## Oynatma

- TV → `GET /playlist` → sıralı `MediaItem` listesi + her biri için R2 **signed URL**
  (kısa ömürlü) + görsel süresi.
- TV listeyi sırayla oynatır: görsel `durationSec` kadar, video tam uzunluk; sona gelince
  başa döner (loop). Liste değişimini periyodik poll veya (ileride) websocket/SSE ile alır.
- Signed URL süresi dolmadan TV yeniler.

## Veri modeli (Prisma)

- **User** — `id`, `googleSub`, `email`, `name`, `avatarUrl`.
- **GoogleToken** — `userId`, şifreli `refreshToken`, `accessToken`, `expiresAt`, `scope`.
- **MediaItem** — `id`, `userId`, `type` (IMAGE|VIDEO), `r2Key`, `originalName`,
  `mimeType`, `sizeBytes`, `durationSec?`, `width?`, `height?`, `source`
  (GOOGLE_PHOTOS|GOOGLE_DRIVE|UPLOAD), `status` (PENDING|READY|FAILED).
- **Playlist** — `id`, `userId`, `name`, `isDefault`.
- **PlaylistItem** — `id`, `playlistId`, `mediaItemId`, `position`, `durationSec`
  (görsel süresi override).
- **UploadSession** — `id`, `userId`, `token`, `expiresAt`, `usedCount`.
- **DeviceSession** (ops.) — TV başına oturum/refresh takibi.

## Klasör yapısı

```
backend/
  prisma/schema.prisma
  src/
    index.ts            # Express app + route bağlama
    config.ts           # env doğrulama
    db.ts               # Prisma client
    lib/
      r2.ts             # S3 client (Cloudflare R2)
      jwt.ts            # kendi JWT üret/doğrula
      crypto.ts         # refresh token şifreleme
    google/
      oauth.ts          # device flow + token yenileme
      photos.ts         # Photos Library API
      drive.ts          # Drive API
    middleware/auth.ts  # Bearer JWT doğrulama
    routes/
      auth.ts           # /auth/device/*
      google.ts         # /google/photos /google/drive
      media.ts          # /media (list, import, delete)
      playlists.ts      # /playlist (get/update sıra+süre)
      upload.ts         # /upload/session /upload/file
  public/upload.html    # QR telefon yükleme sayfası
tv-app/                 # react-native-tvos
```
