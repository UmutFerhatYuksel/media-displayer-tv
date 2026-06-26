import type { Response } from 'express';

// Panel → TV anlık senkron için basit long-poll otobüsü (bellek içi).
// TV `/device/sync-wait`'i açık tutar; panel `POST /devices/:id/sync` çağırınca
// o cihazın bekleyen isteği hemen { sync: true } ile yanıtlanır → TV anında tazeler.

const waiters = new Map<string, Set<Response>>();
// Cihaz o an bağlı değilken gelen istekler: bir sonraki bağlanışta teslim edilir.
const pending = new Set<string>();

const TIMEOUT_MS = 25_000; // bu süre dolunca { sync: false } → TV yeniden bağlanır

export function waitForSync(deviceId: string, res: Response): void {
  // Cihaz bağlı değilken sinyal gelmişse hemen teslim et.
  if (pending.has(deviceId)) {
    pending.delete(deviceId);
    res.json({ sync: true });
    return;
  }

  let set = waiters.get(deviceId);
  if (!set) {
    set = new Set();
    waiters.set(deviceId, set);
  }
  set.add(res);

  const cleanup = () => {
    const s = waiters.get(deviceId);
    if (s) {
      s.delete(res);
      if (s.size === 0) waiters.delete(deviceId);
    }
  };

  const timer = setTimeout(() => {
    cleanup();
    if (!res.writableEnded) res.json({ sync: false });
  }, TIMEOUT_MS);

  // İstemci bağlantıyı kapatırsa (TV reset, ağ kesik) kaydı temizle.
  res.on('close', () => {
    clearTimeout(timer);
    cleanup();
  });
}

export function triggerSync(deviceId: string): void {
  const set = waiters.get(deviceId);
  if (set && set.size > 0) {
    for (const res of set) {
      if (!res.writableEnded) res.json({ sync: true });
    }
    waiters.delete(deviceId);
  } else {
    // Bekleyen yok → işaretle, cihaz bağlanınca teslim edilsin.
    pending.add(deviceId);
  }
}
