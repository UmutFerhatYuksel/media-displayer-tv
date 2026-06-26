# Mimari

## Genel görünüm

Merkezi yönetimli dijital tabela (digital signage) sistemi. Yönetici bir **panelden**
klinik ekler, her klinik içine **cihaz** (TV/ekran) bağlar ve cihazlara **galeri** atar.
TV ince bir oynatıcıdır: yalnızca atanan galeriyi loop oynatır.

```
┌──────────────────────────┐        ┌──────────────┐
│   Admin Paneli (web)     │───────►│  Backend API │────► Cloudflare R2
│  • login (email/şifre)   │        │  Express+TS  │      (medya dosyaları)
│  • klinik/cihaz/galeri   │◄───────│  Prisma      │────► PostgreSQL
│  • medya upload (R2)     │        └──────┬───────┘
└──────────────────────────┘               │ cihaz token'ı
                                            ▼
┌──────────────────────────┐        ┌──────────────┐
│   TV App (RN tvos)       │───────►│  /device/*   │
│  • eşleştirme kodu göster │◄───────│  pair/poll   │
│  • galeriyi loop oynat   │        │  playlist    │
└──────────────────────────┘        └──────────────┘
```

**İlke:** TV pasif ekran; tüm yönetim panelden. Cihazlar yalnızca kendi backend'imizle
konuşur ve sadece kendilerine atanan içeriği görür.

## Hiyerarşi (veri modeli)

```
Admin (panel login)                          MediaItem (R2'de dosya, klinik havuzu)
                                                  ▲ GalleryItem ile kullanılır
Clinic ──┬── Device ── ownGallery (DEVICE) ──────┤
         │      └────── sharedGallery (SHARED) ──┘
         └── Gallery (SHARED | DEVICE)
```

- **Admin** — `email`, `passwordHash`, `name`. Çoklu admin; hepsi tüm klinikleri yönetir.
- **Clinic** — `name`, `address?`. Yönetici elle ekler.
- **Device** — `clinicId?`, `name`, `status` (UNPAIRED|PAIRED), `pairingCode?`,
  `pairingSecret?`, `ownGalleryId?`, `sharedGalleryId?`, `lastSeenAt`. Fiziksel TV.
- **Gallery** — `clinicId`, `kind` (DEVICE|SHARED), `name`, `loop`, `shuffle`,
  `imageDurationSec`. Sıralı medya koleksiyonu.
- **GalleryItem** — `galleryId`, `mediaItemId`, `position`, `durationSec`.
- **MediaItem** — `clinicId`, `type` (IMAGE|VIDEO), `r2Key`, `thumbKey?`, `mimeType`,
  `sizeBytes`, `contentHash` (klinik içi dedup), `status`. Yalnızca panelden R2 upload.

## Kimlik doğrulama

İki JWT türü, tek `JWT_SECRET`:
- **Admin oturumu** (`kind: 'admin'`, 7 gün) — panel login (`POST /admin/auth/login`,
  bcrypt). `requireAdmin` middleware.
- **Cihaz token'ı** (`kind: 'device'`, süresiz) — eşleştirme sonunda verilir.
  `requireDevice` middleware.

İlk admin `ADMIN_BOOTSTRAP_EMAIL`/`_PASSWORD` ile açılışta upsert edilir.

## Cihaz eşleştirme (TV kod gösterir → panelden bağlanır)

1. TV → `POST /device/pair/start` → backend UNPAIRED bir `Device` + 6 haneli `pairingCode`
   oluşturur; TV'ye `{ deviceId, pairingCode, pairingSecret }` döner. TV kodu saklar (yeniden
   açılışta aynı kod) ve ekranda gösterir.
2. TV → `POST /device/pair/poll` (deviceId + pairingSecret) ile bekler.
3. Admin panelde **kodu girer** → cihaz kliniğe bağlanır, isim verilir, **cihaza özel galeri
   otomatik açılır**, istenirse ortak galeri atanır → `status=PAIRED`. (`POST /devices/bind`)
4. TV'nin poll'u `cihaz token'ı` döner. TV saklar; `pairingCode` temizlenir (tekrar
   bağlanamaz).

## Oynatma

- TV → `GET /device/playlist?rev=<son revision>` → atanan **ortak galeri + cihaza özel
  galeri** öğeleri arka arkaya, her biri için kısa ömürlü R2 **signed URL** + süre.
- **Koşullu poll:** içerik değişmediyse backend `{ unchanged: true }` döner (signed URL
  üretmez) → gereksiz iş yapılmaz. `revision` öğe id'leri + süreleri üzerinden hesaplanır.
- TV listeyi sırayla oynatır: görsel `durationSec` kadar, video tam uzunluk; sona gelince
  başa döner (loop). 1 dk'da bir içerik/URL yeniler + `POST /device/heartbeat` ile canlılık
  bildirir. Cihaz panelden çözülürse playlist `409` döner → TV eşleştirme ekranına döner.

## Medya girişi (panelden R2'ye)

- **Küçük dosya:** `POST /media/upload` (multipart, gövde backend'den geçer). İçerik hash'i
  ile klinik içi dedup.
- **Büyük video:** `POST /media/presign` → imzalı PUT URL → panel doğrudan R2'ye yükler →
  `POST /media/complete` ile `MediaItem` oluşur (video ise önizleme karesi üretilir).

## API yüzeyi

| Yol | Auth | Açıklama |
|-----|------|----------|
| `POST /admin/auth/login` `register` `GET /me` | — / admin | Panel oturumu |
| `GET/POST/PATCH/DELETE /clinics` | admin | Klinik CRUD |
| `GET /clinics/:id` | admin | Klinik detayı (cihaz+galeri) |
| `POST /galleries` `GET/PATCH/DELETE /galleries/:id` | admin | Galeri + ayarlar |
| `.../items` `/reorder` `/items/:id/duration` | admin | Galeri içeriği |
| `POST /devices/bind` `PATCH/DELETE /devices/:id` | admin | Cihaz bağlama/atama |
| `GET/POST/DELETE /media` `/upload` `/presign` `/complete` | admin | Medya havuzu |
| `POST /device/pair/start` `pair/poll` | — | Eşleştirme |
| `GET /device/playlist` `POST /device/heartbeat` | device | Oynatma |

## Klasör yapısı

```
backend/
  prisma/schema.prisma
  src/
    index.ts            # Express app + route bağlama + bootstrap admin
    config.ts           # env doğrulama
    db.ts               # Prisma client
    lib/
      r2.ts             # S3 client (Cloudflare R2)
      jwt.ts            # admin + cihaz JWT
      gallery.ts        # galeri/cihaz playlist üretimi (signed URL)
      thumbnail.ts      # video önizleme karesi (ffmpeg)
    middleware/auth.ts  # requireAdmin / requireDevice
    routes/
      admin-auth.ts     # /admin/auth/*
      clinics.ts        # /clinics
      galleries.ts      # /galleries
      devices.ts        # /devices (bind/atama — admin)
      media.ts          # /media (panel upload)
      device.ts         # /device (pair/playlist/heartbeat — TV)
panel/                  # Vite + React + TS admin paneli
  src/
    api.ts              # backend istemcisi
    pages/              # Login, Clinics, ClinicDetail, GalleryEditor
    components/TopBar.tsx
tv-app/                 # react-native-tvos
  App.tsx               # pair ↔ player
  src/screens/          # PairScreen, PlayerScreen
```
