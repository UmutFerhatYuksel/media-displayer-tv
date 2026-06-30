// Backend'in TV'den erişilebilir adresi.
//
// DEV (fiziksel box, adb ile bağlı): backend'i adb tüneli üzerinden ver.
//   PC'de:  adb -s <box> reverse tcp:4000 tcp:4000   (Metro için de tcp:8081)
//   Açık IPv4 (127.0.0.1) yaz → adb reverse yalnız IPv4'ü yönlendirdiği için "localhost"
//   (IPv6 ::1'e çözülüp) bağlanamama sorununu aşar. Firewall'a gerek kalmaz.
// NOT: Emülatör testi için 10.0.2.2'ye çevrildi. Fiziksel TV'ye dönerken aşağıdaki
// LAN değerini geri aç (192.168.0.25).
export const API_BASE_URL = 'http://10.0.2.2:4000';

// Alternatifler:
//  - Emülatör:                 'http://10.0.2.2:4000'
//  - Aynı WiFi'da LAN (firewall 4000 açık olmalı): 'http://192.168.0.25:4000'
//  - Production (HTTPS, kalıcı): 'https://api.musteridomain.com'
