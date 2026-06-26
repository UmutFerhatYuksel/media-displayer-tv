import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Trash2, Type, Move, Palette, Droplet } from 'lucide-react';
import { setItemOverlay, type GalleryItem, type MediaItem } from '../api';
import { Button, Modal, Badge } from '../ui';

// #rgb / #rrggbb + opaklık → rgba() (önizleme şeridi arka planı için)
function hexToRgba(hex: string, opacity: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// İçeriğin üstüne kayan yazı + banner bindirme. TV oranında (16:9) canlı önizleme;
// banner sürüklenip köşesinden boyutlandırılabilir. Konum 0..1 olarak saklanır.
export default function OverlayEditor({
  galleryId, item, pool, onClose, onSaved,
}: {
  galleryId: string;
  item: GalleryItem;
  pool: MediaItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ticker, setTicker] = useState(item.tickerText ?? '');
  const [tickerColor, setTickerColor] = useState(item.tickerColor ?? '#ffffff');
  const [tickerOpacity, setTickerOpacity] = useState(item.tickerOpacity ?? 1);
  const [tickerBgColor, setTickerBgColor] = useState(item.tickerBgColor ?? '#000000');
  const [tickerBgOpacity, setTickerBgOpacity] = useState(item.tickerBgOpacity ?? 0.6);
  const [bannerId, setBannerId] = useState<string | null>(item.overlayImageId ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(item.overlayImageUrl ?? null);
  const [rect, setRect] = useState({
    x: item.overlayX ?? 0.72,
    y: item.overlayY ?? 0.72,
    w: item.overlayW ?? 0.22,
    h: item.overlayH ?? 0.18,
  });
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  // Banner gövdesini sürükle (taşı) veya köşesinden boyutlandır.
  function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const start = { ...rect };

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / box.width;
      const dy = (ev.clientY - sy) / box.height;
      if (mode === 'move') {
        setRect({
          ...start,
          x: clamp(start.x + dx, 0, 1 - start.w),
          y: clamp(start.y + dy, 0, 1 - start.h),
        });
      } else {
        setRect({
          ...start,
          w: clamp(start.w + dx, 0.05, 1 - start.x),
          h: clamp(start.h + dy, 0.05, 1 - start.y),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function save() {
    setBusy(true);
    try {
      await setItemOverlay(galleryId, item.galleryItemId, {
        tickerText: ticker.trim() ? ticker.trim() : null,
        tickerColor,
        tickerOpacity,
        tickerBgColor,
        tickerBgOpacity,
        overlayImageId: bannerId,
        overlayX: rect.x,
        overlayY: rect.y,
        overlayW: rect.w,
        overlayH: rect.h,
      });
      toast.success('Overlay kaydedildi');
      onSaved();
    } catch {
      toast.error('Kaydedilemedi');
      setBusy(false);
    }
  }

  const images = pool.filter((m) => m.type === 'IMAGE' && m.previewUrl);

  return (
    <Modal title="Overlay düzenle" width={680} onClose={onClose}>
      {/* Canlı TV önizleme (16:9) */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label mb-0 flex items-center gap-1.5"><Move size={13} /> TV önizleme — banner'ı sürükle, köşeden boyutlandır</span>
        <span className="text-xs text-muted">16:9</span>
      </div>
      <div
        ref={stageRef}
        className="relative w-full select-none overflow-hidden rounded-xl border border-border bg-black"
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* İçerik (arka plan) */}
        {item.previewUrl
          ? <img src={item.previewUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
          : <div className="absolute inset-0 grid place-items-center text-muted">içerik önizlemesi yok</div>}

        {/* Banner */}
        {bannerUrl && (
          <div
            className="absolute cursor-move touch-none rounded-md ring-2 ring-primary/70"
            style={{
              left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
            }}
            onPointerDown={(e) => startDrag(e, 'move')}
          >
            <img src={bannerUrl} alt="" className="h-full w-full object-contain" draggable={false} />
            {/* Boyutlandırma tutamacı */}
            <div
              className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-primary"
              onPointerDown={(e) => startDrag(e, 'resize')}
            />
          </div>
        )}

        {/* Kayan yazı bandı */}
        {ticker.trim() && (
          <div className="absolute inset-x-0 bottom-0 overflow-hidden py-1.5" style={{ backgroundColor: hexToRgba(tickerBgColor, tickerBgOpacity) }}>
            <span className="marquee-track px-4 text-sm font-medium" style={{ color: tickerColor, opacity: tickerOpacity }}>{ticker.trim()}</span>
          </div>
        )}
      </div>

      {/* Kontroller */}
      <label className="label mt-5 flex items-center gap-1.5"><Type size={13} /> Alt kayan yazı</label>
      <input className="input" value={ticker} onChange={(e) => setTicker(e.target.value)}
        placeholder="Örn. Kampanya: diş beyazlatmada %20 indirim — bilgi için resepsiyon" />

      {/* Kayan yazı görünümü: renk + opaklık */}
      <div className="mt-3 flex flex-wrap items-end gap-5">
        <div>
          <label className="label flex items-center gap-1.5"><Palette size={13} /> Yazı rengi</label>
          <div className="flex items-center gap-2">
            <input type="color" value={tickerColor} onChange={(e) => setTickerColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface-2 p-1" />
            <span className="text-xs uppercase text-muted">{tickerColor}</span>
          </div>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5"><Droplet size={13} /> Opaklık</span>
            <span className="text-xs text-muted">{Math.round(tickerOpacity * 100)}%</span>
          </label>
          <input type="range" min={0} max={1} step={0.05} value={tickerOpacity}
            onChange={(e) => setTickerOpacity(Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
      </div>

      {/* Kayan yazı şeridi: arka plan rengi + opaklık */}
      <div className="mt-3 flex flex-wrap items-end gap-5">
        <div>
          <label className="label flex items-center gap-1.5"><Palette size={13} /> Şerit rengi</label>
          <div className="flex items-center gap-2">
            <input type="color" value={tickerBgColor} onChange={(e) => setTickerBgColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface-2 p-1" />
            <span className="text-xs uppercase text-muted">{tickerBgColor}</span>
          </div>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5"><Droplet size={13} /> Şerit opaklığı</span>
            <span className="text-xs text-muted">{Math.round(tickerBgOpacity * 100)}%</span>
          </label>
          <input type="range" min={0} max={1} step={0.05} value={tickerBgOpacity}
            onChange={(e) => setTickerBgOpacity(Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
      </div>

      <label className="label mt-4 flex items-center gap-1.5"><ImagePlus size={13} /> Reklam görseli (banner)</label>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setPicking((v) => !v)}>
          {bannerId ? 'Görseli değiştir' : 'Havuzdan görsel seç'}
        </Button>
        {bannerId && (
          <Button size="sm" variant="danger" onClick={() => { setBannerId(null); setBannerUrl(null); }}>
            <Trash2 size={14} /> Banner'ı kaldır
          </Button>
        )}
        {bannerId && <Badge tone="primary">Banner seçili</Badge>}
      </div>

      {picking && (
        <div className="mt-3 grid max-h-44 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2 sm:grid-cols-6">
          {images.length === 0 && <p className="col-span-full p-2 text-sm text-muted">Havuzda görsel yok.</p>}
          {images.map((m) => (
            <button key={m.id} type="button"
              className={`overflow-hidden rounded-lg border transition ${bannerId === m.id ? 'border-primary ring-2 ring-primary/50' : 'border-border hover:border-primary'}`}
              onClick={() => { setBannerId(m.id); setBannerUrl(m.previewUrl ?? null); setPicking(false); }}>
              <img src={m.previewUrl!} alt="" className="aspect-video w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
        <Button variant="primary" loading={busy} onClick={save}>Kaydet</Button>
      </div>
    </Modal>
  );
}
