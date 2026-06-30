import { useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Trash2, Type, Palette, Droplet, PanelLeft, PanelRight, PanelTop, PanelBottom, Maximize2 } from 'lucide-react';
import { setItemOverlay, type GalleryItem, type MediaItem, type OverlaySide } from '../api';
import { Button, Modal, Badge } from '../ui';

// #rgb / #rrggbb + opaklık → rgba() (önizleme şeridi arka planı için)
function hexToRgba(hex: string, opacity: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const SIDES: { key: OverlaySide; label: string; Icon: typeof PanelLeft }[] = [
  { key: 'left', label: 'Sol', Icon: PanelLeft },
  { key: 'right', label: 'Sağ', Icon: PanelRight },
  { key: 'top', label: 'Üst', Icon: PanelTop },
  { key: 'bottom', label: 'Alt', Icon: PanelBottom },
];

// İçeriği bir kenara yaslayıp küçülten reklam ("squeeze-back") + alt kayan yazı.
// Önizlemede video şeridin yanına sığar; konum 'side' + 'size' (0..1) olarak saklanır.
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
  const [side, setSide] = useState<OverlaySide>(item.overlaySide ?? 'right');
  const [size, setSize] = useState(item.overlaySize ?? 0.25);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  // Bölmeyi flex oranıyla yapıyoruz (yüzde yükseklik, aspect-ratio'lu kapsayıcıda
  // çözülmediği için): içerik 1-size, reklam size kadar pay alır.
  const contentFrac = 1 - size;

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
        overlaySide: side,
        overlaySize: size,
      });
      toast.success('Overlay kaydedildi');
      onSaved();
    } catch {
      toast.error('Kaydedilemedi');
      setBusy(false);
    }
  }

  const images = pool.filter((m) => m.type === 'IMAGE' && m.previewUrl);

  // Önizleme: içerik önce, reklam şeridi sonra geldiği için kenara göre yön:
  // sol/üst kenarda reklamın öne geçmesi için *-reverse kullanılır.
  const flexDir =
    side === 'left' ? 'row-reverse' : side === 'right' ? 'row'
    : side === 'top' ? 'column-reverse' : 'column';

  return (
    <Modal title="Overlay düzenle" width={680} onClose={onClose}>
      {/* Canlı TV önizleme (16:9) — reklam kenarda, video yanına sığar */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label mb-0 flex items-center gap-1.5"><Maximize2 size={13} /> TV önizleme — reklam kenara yaslanır, video küçülür</span>
        <span className="text-xs text-muted">16:9</span>
      </div>
      <div
        className="relative flex w-full select-none overflow-hidden rounded-xl border border-border bg-black"
        style={{ aspectRatio: '16 / 9', flexDirection: bannerUrl ? (flexDir as 'row') : 'row' }}
      >
        {/* İçerik (küçülen video/görsel) */}
        <div
          className="relative grid min-h-0 min-w-0 place-items-center overflow-hidden bg-black"
          style={{ flexGrow: bannerUrl ? contentFrac : 1, flexBasis: 0 }}
        >
          {item.previewUrl
            ? <img src={item.previewUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
            : <span className="text-muted">içerik önizlemesi yok</span>}

          {/* Kayan yazı bandı (içerik alanının altında) */}
          {ticker.trim() && (
            <div className="absolute inset-x-0 bottom-0 overflow-hidden py-1.5" style={{ backgroundColor: hexToRgba(tickerBgColor, tickerBgOpacity) }}>
              <span className="marquee-track px-4 text-sm font-medium" style={{ color: tickerColor, opacity: tickerOpacity }}>{ticker.trim()}</span>
            </div>
          )}
        </div>

        {/* Reklam şeridi */}
        {bannerUrl && (
          <div
            className="relative min-h-0 min-w-0 overflow-hidden bg-black ring-1 ring-primary/40"
            style={{ flexGrow: size, flexBasis: 0 }}
          >
            <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          </div>
        )}
      </div>

      {/* Reklam görseli seçimi */}
      <label className="label mt-5 flex items-center gap-1.5"><ImagePlus size={13} /> Reklam görseli (banner)</label>
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

      {/* Kenar + şerit boyutu (yalnız banner seçiliyken anlamlı) */}
      {bannerId && (
        <>
          <label className="label mt-4 flex items-center gap-1.5"><PanelRight size={13} /> Yerleşim kenarı</label>
          <div className="flex flex-wrap gap-2">
            {SIDES.map(({ key, label, Icon }) => (
              <button key={key} type="button" onClick={() => setSide(key)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${side === key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary'}`}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <label className="label flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5"><Maximize2 size={13} /> Reklam şeridi boyutu</span>
              <span className="text-xs text-muted">{Math.round(size * 100)}% ekran</span>
            </label>
            <input type="range" min={0.05} max={0.6} step={0.01} value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full accent-primary" />
          </div>
        </>
      )}

      {/* Alt kayan yazı */}
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

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
        <Button variant="primary" loading={busy} onClick={save}>Kaydet</Button>
      </div>
    </Modal>
  );
}
