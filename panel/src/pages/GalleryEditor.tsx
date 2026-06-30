import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Plus, Trash2, Film, Repeat, Shuffle, Clock, ImageOff, Check, X, Megaphone,
} from 'lucide-react';
import {
  getGallery, updateGallery, addGalleryItem, removeGalleryItem, reorderGallery,
  setItemDuration, listMedia, type GalleryDetail, type GalleryItem, type MediaItem,
} from '../api';
import { PageHeader } from '../components/Layout';
import { Button, Card, Modal, EmptyState, Skeleton, Badge } from '../ui';
import OverlayEditor from '../components/OverlayEditor';

export default function GalleryEditor() {
  const { id } = useParams<{ id: string }>();
  const [g, setG] = useState<GalleryDetail | null>(null);
  const [pool, setPool] = useState<MediaItem[]>([]);
  const [picker, setPicker] = useState(false);
  const [overlayItem, setOverlayItem] = useState<GalleryItem | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    if (!id) return;
    const gallery = await getGallery(id);
    setG(gallery);
    setPool((await listMedia(gallery.clinicId)).items);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!g) {
    return (<><PageHeader title="Yükleniyor…" /><div className="space-y-3 p-8"><Skeleton className="h-28" /><Skeleton className="h-16" /></div></>);
  }

  const inGallery = new Set(g.items.map((i) => i.mediaId));

  async function onDragEnd(e: DragEndEvent) {
    if (!g || !e.over || e.active.id === e.over.id) return;
    const oldI = g.items.findIndex((i) => i.galleryItemId === e.active.id);
    const newI = g.items.findIndex((i) => i.galleryItemId === e.over!.id);
    const items = arrayMove(g.items, oldI, newI);
    setG({ ...g, items });
    await reorderGallery(g.id, items.map((i) => i.galleryItemId));
  }

  return (
    <>
      <PageHeader
        title={g.name}
        subtitle={`${g.kind === 'SHARED' ? 'Watchlist' : 'Cihaz galerisi'} · ${g.items.length} öğe`}
        actions={<Button variant="primary" onClick={() => setPicker(true)}><Plus size={16} /> Medya ekle</Button>}
      />

      <div className="space-y-6 p-8">
        {/* Ayarlar */}
        <Card>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="label">Galeri adı</label>
              <input className="input" defaultValue={g.name}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) updateGallery(g.id, { name: v }).then(() => toast.success('Ad güncellendi')); }} />
            </div>
            <div>
              <label className="label flex items-center gap-1.5"><Clock size={13} /> Görsel süresi (sn)</label>
              <input className="input" type="number" min={1} max={600} defaultValue={g.imageDurationSec}
                onBlur={(e) => { const v = Number(e.target.value); if (v >= 1) updateGallery(g.id, { imageDurationSec: v, applyDurationToAll: true }).then(() => { toast.success('Tüm görsellere uygulandı'); load(); }); }} />
            </div>
            <div className="flex items-end gap-2">
              <Toggle label="Döngü" icon={<Repeat size={15} />} defaultChecked={g.loop} onChange={(v) => updateGallery(g.id, { loop: v })} />
              <Toggle label="Karışık" icon={<Shuffle size={15} />} defaultChecked={g.shuffle} onChange={(v) => updateGallery(g.id, { shuffle: v })} />
            </div>
          </div>
        </Card>

        {/* Öğeler */}
        {g.items.length === 0 ? (
          <EmptyState
            icon={<ImageOff size={26} />}
            title="Galeri boş"
            hint="Klinik havuzundan medya ekleyin. Eklenen öğeler sırayla oynatılır."
            action={<Button variant="primary" onClick={() => setPicker(true)}><Plus size={16} /> Medya ekle</Button>}
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={g.items.map((i) => i.galleryItemId)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {g.items.map((it, idx) => (
                  <SortableRow key={it.galleryItemId} item={it} index={idx}
                    onDuration={(v) => setItemDuration(g.id, it.galleryItemId, v)}
                    onOverlay={() => setOverlayItem(it)}
                    onRemove={async () => { await removeGalleryItem(g.id, it.galleryItemId); toast.success('Çıkarıldı'); load(); }} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {picker && (
        <Modal title="Medya ekle" width={760} onClose={() => setPicker(false)}>
          {pool.length === 0 ? (
            <p className="text-sm text-muted">Klinik havuzunda medya yok. Önce klinik sayfasından yükleyin.</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {pool.map((m) => {
                const added = inGallery.has(m.id);
                return (
                  <button key={m.id} disabled={added}
                    className={`group relative overflow-hidden rounded-xl border text-left transition ${added ? 'border-ok/40 opacity-60' : 'border-border hover:border-primary'}`}
                    onClick={async () => { await addGalleryItem(g.id, m.id); toast.success('Eklendi'); await load(); }}>
                    {m.previewUrl ? <img src={m.previewUrl} alt="" className="aspect-video w-full object-cover" />
                      : <div className="flex aspect-video w-full items-center justify-center bg-bg text-muted"><Film size={20} /></div>}
                    <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                      <span className="truncate text-muted">{m.originalName}</span>
                      {added ? <Check size={15} className="shrink-0 text-ok" /> : <Plus size={15} className="shrink-0 text-primary opacity-0 transition group-hover:opacity-100" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={() => setPicker(false)}><X size={15} /> Kapat</Button>
          </div>
        </Modal>
      )}

      {overlayItem && (
        <OverlayEditor
          galleryId={g.id}
          item={overlayItem}
          pool={pool}
          onClose={() => setOverlayItem(null)}
          onSaved={() => { setOverlayItem(null); load(); }}
        />
      )}
    </>
  );
}

function SortableRow({
  item, index, onDuration, onOverlay, onRemove,
}: {
  item: GalleryItem;
  index: number;
  onDuration: (v: number) => void;
  onOverlay: () => void;
  onRemove: () => void;
}) {
  const hasOverlay = !!(item.tickerText || item.overlayImageId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.galleryItemId });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 ${isDragging ? 'z-10 opacity-80 shadow-card' : ''}`}
    >
      <button className="cursor-grab text-muted hover:text-text active:cursor-grabbing" {...attributes} {...listeners} title="Sürükle">
        <GripVertical size={18} />
      </button>
      <span className="w-5 text-center text-xs text-muted/60">{index + 1}</span>
      {item.previewUrl ? <img src={item.previewUrl} alt="" className="h-11 w-20 rounded-lg object-cover" />
        : <div className="flex h-11 w-20 items-center justify-center rounded-lg bg-surface-2 text-muted"><Film size={16} /></div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{item.originalName || item.mediaId}</div>
        <Badge tone={item.type === 'VIDEO' ? 'primary' : 'muted'}>{item.type === 'VIDEO' ? 'Video' : 'Görsel'}</Badge>
      </div>
      {item.type === 'IMAGE' && (
        <div className="flex items-center gap-1.5 text-muted">
          <Clock size={14} />
          <input type="number" min={1} max={600} defaultValue={item.durationSec}
            className="input w-20 px-2 py-1.5 text-center text-sm"
            onBlur={(e) => { const v = Number(e.target.value); if (v >= 1 && v !== item.durationSec) { onDuration(v); toast.success('Süre güncellendi'); } }} />
          <span className="text-xs">sn</span>
        </div>
      )}
      <button
        className={`btn btn-sm ${hasOverlay ? 'border-primary/50 bg-primary/10 text-primary' : 'btn-ghost'}`}
        onClick={onOverlay}
        title="Overlay (kayan yazı / banner)"
      >
        <Megaphone size={15} /> {hasOverlay ? 'Overlay •' : 'Overlay'}
      </button>
      <button className="btn-ghost btn btn-sm text-danger" onClick={onRemove} title="Çıkar"><Trash2 size={15} /></button>
    </div>
  );
}

function Toggle({ label, icon, defaultChecked, onChange }: { label: string; icon: React.ReactNode; defaultChecked: boolean; onChange: (v: boolean) => void }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      type="button"
      onClick={() => { const v = !on; setOn(v); onChange(v); }}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
        on ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-surface-2 text-muted hover:text-text'
      }`}
    >
      {icon} {label}
    </button>
  );
}
