import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  MonitorPlay, Plus, Trash2, Images, ArrowRight, UploadCloud, Film, Link2, Tv,
  CheckCircle2, Send, X, RefreshCw, Info,
} from 'lucide-react';
import {
  getClinic, bindDevice, updateDevice, deleteDevice, syncDevice,
  createGallery, deleteGallery, listMedia, uploadMedia, deleteMedia, assignMedia,
  ApiError, type ClinicDetail as Clinic, type ClinicDevice, type MediaItem,
} from '../api';
import { PageHeader } from '../components/Layout';
import { Button, Card, Modal, EmptyState, Skeleton, StatusDot, Badge, lastSeen } from '../ui';

export default function ClinicDetail() {
  const { id } = useParams<{ id: string }>();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [binding, setBinding] = useState(false);
  const [infoDevice, setInfoDevice] = useState<ClinicDevice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, m] = await Promise.all([getClinic(id), listMedia(id)]);
    setClinic(c);
    setMedia(m.items);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Canlı durum için 30 sn'de bir cihazları tazele.
  useEffect(() => {
    const t = setInterval(() => { if (id) getClinic(id).then(setClinic).catch(() => {}); }, 30_000);
    return () => clearInterval(t);
  }, [id]);

  if (loading || !clinic) {
    return (
      <>
        <PageHeader title="Yükleniyor…" />
        <div className="space-y-3 p-8">
          <Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
      </>
    );
  }

  const sharedGalleries = clinic.galleries.filter((g) => g.kind === 'SHARED');

  return (
    <>
      <PageHeader
        title={clinic.name}
        subtitle={clinic.address ?? undefined}
        actions={<Button variant="primary" onClick={() => setBinding(true)}><Plus size={16} /> Cihaz bağla</Button>}
      />

      <div className="space-y-10 p-8">
        {/* Cihazlar */}
        <section>
          <SectionTitle icon={<MonitorPlay size={18} />} title="Cihazlar" count={clinic.devices.length} />
          {clinic.devices.length === 0 ? (
            <EmptyState
              icon={<Tv size={26} />}
              title="Henüz cihaz yok"
              hint="TV ekranındaki eşleştirme kodunu girerek bir ekran bağlayın."
              action={<Button variant="primary" onClick={() => setBinding(true)}><Plus size={16} /> Cihaz bağla</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {clinic.devices.map((d) => {
                const seen = lastSeen(d.lastSeenAt);
                return (
                  <Card key={d.id} className="group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-primary">
                          <MonitorPlay size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 font-semibold">{d.name || 'İsimsiz cihaz'}</div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                            <StatusDot online={seen.online} /> {seen.online ? 'Çevrimiçi' : `Son: ${seen.text}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-ghost btn btn-sm"
                          onClick={() => setInfoDevice(d)}
                          title="Cihaz bilgileri"
                        ><Info size={15} /></button>
                        <button
                          className="btn-ghost btn btn-sm opacity-0 transition group-hover:opacity-100"
                          onClick={async () => { if (confirm('Cihaz silinsin mi?')) { await deleteDevice(d.id); toast.success('Cihaz silindi'); load(); } }}
                          title="Sil"
                        ><Trash2 size={15} /></button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      {d.ownGalleryId && (
                        <Link to={`/galleries/${d.ownGalleryId}`}>
                          <Button size="sm"><Images size={15} /> Cihaz galerisi <ArrowRight size={14} /></Button>
                        </Link>
                      )}
                      <SyncButton deviceId={d.id} />
                      <div className="min-w-[200px] flex-1">
                        <label className="label flex items-center gap-1.5"><Link2 size={13} /> Ortak galeri</label>
                        <select
                          className="input"
                          value={d.sharedGalleryId ?? ''}
                          onChange={async (e) => {
                            await updateDevice(d.id, { sharedGalleryId: e.target.value || null });
                            toast.success('Ortak galeri güncellendi');
                            load();
                          }}
                        >
                          <option value="">— Yok —</option>
                          {sharedGalleries.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* Ortak galeriler */}
        <section>
          <SectionTitle
            icon={<Images size={18} />}
            title="Ortak galeriler"
            count={sharedGalleries.length}
            action={
              <Button size="sm" onClick={async () => {
                const name = prompt('Ortak galeri adı:');
                if (name?.trim()) { await createGallery(clinic.id, 'SHARED', name.trim()); toast.success('Galeri oluşturuldu'); load(); }
              }}><Plus size={15} /> Ekle</Button>
            }
          />
          {sharedGalleries.length === 0 ? (
            <p className="text-sm text-muted">Henüz ortak galeri yok. Tüm cihazlarda gösterilecek içerik için bir tane oluşturun.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sharedGalleries.map((g) => (
                <Card key={g.id} className="group transition hover:border-border-strong">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-accent"><Images size={20} /></div>
                    <button className="btn-ghost btn btn-sm opacity-0 transition group-hover:opacity-100"
                      onClick={async () => { if (confirm('Galeri silinsin mi?')) { await deleteGallery(g.id); toast.success('Galeri silindi'); load(); } }}
                      title="Sil"><Trash2 size={15} /></button>
                  </div>
                  <Link to={`/galleries/${g.id}`} className="mt-3 block">
                    <h3 className="font-semibold">{g.name}</h3>
                    <p className="mt-0.5 text-sm text-muted">{g.itemCount} öğe</p>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Medya havuzu */}
        <MediaPool clinic={clinic} media={media} onChange={load} />
      </div>

      {binding && (
        <BindModal
          clinicId={clinic.id}
          sharedGalleries={sharedGalleries.map((g) => ({ id: g.id, name: g.name }))}
          onClose={() => setBinding(false)}
          onDone={() => { setBinding(false); load(); }}
        />
      )}

      {infoDevice && (
        <DeviceInfoModal device={infoDevice} clinicName={clinic.name} onClose={() => setInfoDevice(null)} />
      )}
    </>
  );
}

function DeviceInfoModal({ device, clinicName, onClose }: { device: ClinicDevice; clinicName: string; onClose: () => void }) {
  const seen = lastSeen(device.lastSeenAt);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Cihaz adı', value: device.name || 'İsimsiz cihaz' },
    { label: 'Durum', value: <Badge tone={device.status === 'PAIRED' ? 'primary' : 'muted'}>{device.status === 'PAIRED' ? 'Eşleşmiş' : 'Eşleşmemiş'}</Badge> },
    { label: 'Bağlantı', value: <span className="flex items-center gap-2"><StatusDot online={seen.online} /> {seen.online ? 'Çevrimiçi' : `Son görülme: ${seen.text}`}</span> },
    { label: 'Klinik', value: clinicName },
    { label: 'Ortak galeri', value: device.sharedGalleryName ?? '— Yok —' },
    { label: 'Cihaz ID', value: <code className="text-xs text-muted">{device.id}</code> },
  ];
  return (
    <Modal title="Cihaz bilgileri" onClose={onClose}>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-muted">{r.label}</span>
            <span className="text-sm font-medium text-right">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {device.ownGalleryId && (
          <Link to={`/galleries/${device.ownGalleryId}`}>
            <Button size="sm"><Images size={15} /> Cihaz galerisi</Button>
          </Link>
        )}
        <SyncButton deviceId={device.id} />
        <Button variant="ghost" onClick={onClose}>Kapat</Button>
      </div>
    </Modal>
  );
}

function SyncButton({ deviceId }: { deviceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      title="Cihaza anlık senkron sinyali gönder"
      onClick={async () => {
        setBusy(true);
        try {
          await syncDevice(deviceId);
          toast.success('Senkron sinyali gönderildi');
        } catch {
          toast.error('Senkron gönderilemedi');
        } finally {
          setBusy(false);
        }
      }}
    >
      <RefreshCw size={15} /> Şimdi senkronla
    </Button>
  );
}

function SectionTitle({ icon, title, count, action }: { icon: React.ReactNode; title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {icon} {title} {count !== undefined && <span className="text-muted/60">· {count}</span>}
      </h2>
      {action}
    </div>
  );
}

function MediaPool({ clinic, media, onChange }: { clinic: Clinic; media: MediaItem[]; onChange: () => void }) {
  const clinicId = clinic.id;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const upload = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!arr.length) return;
    setBusy(true);
    const t = toast.loading(`0/${arr.length} yükleniyor…`);
    let done = 0;
    for (const f of arr) {
      try {
        await uploadMedia(clinicId, f);
      } catch {
        toast.error(`${f.name} yüklenemedi`);
      }
      done++;
      toast.loading(`${done}/${arr.length} yüklendi`, { id: t });
    }
    toast.success(`${done} dosya yüklendi`, { id: t });
    setBusy(false);
    onChange();
  }, [clinicId, onChange]);

  // Hedef galeriler: her cihazın kendi galerisi + ortak galeriler.
  const targets = [
    ...clinic.devices
      .filter((d) => d.ownGalleryId)
      .map((d) => ({ galleryId: d.ownGalleryId!, label: d.name || 'İsimsiz cihaz', kind: 'device' as const })),
    ...clinic.galleries
      .filter((g) => g.kind === 'SHARED')
      .map((g) => ({ galleryId: g.id, label: g.name, kind: 'shared' as const })),
  ];

  return (
    <section>
      <SectionTitle icon={<Film size={18} />} title="Medya havuzu" count={media.length} />

      {/* Seçim araç çubuğu */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-medium text-primary">{selected.size} öğe seçildi</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X size={15} /> Vazgeç</Button>
            <Button size="sm" variant="primary" onClick={() => setAssigning(true)}><Send size={15} /> Cihazlara ekle</Button>
          </div>
        </div>
      )}

      <div
        className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition ${
          drag ? 'border-primary bg-primary/5' : 'border-border bg-surface/40 hover:border-border-strong'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      >
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
          onChange={(e) => { if (e.target.files) upload(e.target.files); if (fileRef.current) fileRef.current.value = ''; }} />
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-primary">
          <UploadCloud size={24} />
        </div>
        <p className="font-medium">{busy ? 'Yükleniyor…' : 'Dosyaları buraya sürükleyin veya tıklayın'}</p>
        <p className="mt-0.5 text-sm text-muted">Görsel ve video · bu kliniğin galerilerinde kullanılabilir</p>
      </div>

      {media.length === 0 ? (
        <p className="text-sm text-muted">Havuz boş.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Eklemek için kutucuklara tıklayıp seçin, sonra “Cihazlara ekle”. Medya havuzda kalır.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {media.map((m) => {
              const isSel = selected.has(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-surface-2 transition ${
                    isSel ? 'border-primary ring-2 ring-primary/50' : 'border-border hover:border-border-strong'
                  }`}
                >
                  {m.previewUrl ? (
                    <img src={m.previewUrl} alt="" className="aspect-video w-full object-cover" />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center bg-bg text-muted"><Film size={20} /></div>
                  )}
                  {/* Seçim göstergesi */}
                  <span className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                    isSel ? 'border-primary bg-primary text-primary-fg' : 'border-white/40 bg-black/40 text-transparent group-hover:text-white/70'
                  }`}>
                    <CheckCircle2 size={15} />
                  </span>
                  {m.type === 'VIDEO' && (
                    <span className="absolute bottom-8 left-1.5"><Badge tone="primary">Video</Badge></span>
                  )}
                  <button
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 transition hover:bg-danger group-hover:opacity-100"
                    onClick={async (e) => { e.stopPropagation(); if (confirm('Medya silinsin mi? (havuzdan tamamen kaldırılır)')) { await deleteMedia(m.id); toast.success('Medya silindi'); onChange(); } }}
                    title="Sil"
                  ><Trash2 size={14} /></button>
                  <div className="truncate px-2 py-1.5 text-xs text-muted">{m.originalName}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {assigning && (
        <AssignModal
          targets={targets}
          count={selected.size}
          onClose={() => setAssigning(false)}
          onConfirm={async (galleryIds) => {
            const { added } = await assignMedia(galleryIds, [...selected]);
            toast.success(added > 0 ? `${added} ekleme yapıldı` : 'Hepsi zaten ekliydi');
            setAssigning(false);
            setSelected(new Set());
            onChange();
          }}
        />
      )}
    </section>
  );
}

function AssignModal({
  targets, count, onClose, onConfirm,
}: {
  targets: { galleryId: string; label: string; kind: 'device' | 'shared' }[];
  count: number;
  onClose: () => void;
  onConfirm: (galleryIds: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) =>
    setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Modal title={`${count} medyayı ekle`} onClose={onClose}>
      {targets.length === 0 ? (
        <p className="text-sm text-muted">Bu klinikte hedef yok. Önce bir cihaz bağlayın veya ortak galeri oluşturun.</p>
      ) : (
        <>
          <p className="-mt-1 mb-3 text-sm text-muted">Hedef galerileri seçin:</p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {targets.map((t) => {
              const on = picked.has(t.galleryId);
              return (
                <button
                  key={t.galleryId}
                  type="button"
                  onClick={() => toggle(t.galleryId)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    on ? 'border-primary bg-primary/10' : 'border-border bg-surface-2 hover:border-border-strong'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${on ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong'}`}>
                    {on && <CheckCircle2 size={13} />}
                  </span>
                  {t.kind === 'device' ? <MonitorPlay size={16} className="text-primary" /> : <Images size={16} className="text-accent" />}
                  <span className="flex-1">{t.label}</span>
                  <Badge tone={t.kind === 'device' ? 'primary' : 'warn'}>{t.kind === 'device' ? 'Cihaz' : 'Ortak'}</Badge>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={picked.size === 0}
          onClick={async () => { setBusy(true); try { await onConfirm([...picked]); } finally { setBusy(false); } }}
        >
          <Send size={15} /> Ekle
        </Button>
      </div>
    </Modal>
  );
}

function BindModal({
  clinicId, sharedGalleries, onClose, onDone,
}: {
  clinicId: string;
  sharedGalleries: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [pairingCode, setCode] = useState('');
  const [name, setName] = useState('');
  const [sharedGalleryId, setShared] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await bindDevice({
        pairingCode: pairingCode.trim().toUpperCase(),
        clinicId,
        name: name.trim(),
        sharedGalleryId: sharedGalleryId || undefined,
      });
      toast.success(`"${name.trim()}" bağlandı`);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === 'invalid_code' ? 'Kod geçersiz veya cihaz zaten bağlı' : 'Bağlama başarısız');
      setBusy(false);
    }
  }

  return (
    <Modal title="Cihaz bağla" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="-mt-1 mb-4 text-sm text-muted">TV ekranında görünen kodu girin.</p>
        <label className="label">Eşleştirme kodu</label>
        <input className="input text-center text-lg font-semibold uppercase tracking-[0.3em]" value={pairingCode}
          onChange={(e) => setCode(e.target.value)} placeholder="ABC123" maxLength={8} autoFocus required />
        <label className="label mt-4">Cihaz adı</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bekleme salonu TV" required />
        <label className="label mt-4">Ortak galeri (opsiyonel)</label>
        <select className="input" value={sharedGalleryId} onChange={(e) => setShared(e.target.value)}>
          <option value="">— Yok —</option>
          {sharedGalleries.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
          <Button variant="primary" loading={busy}>Bağla</Button>
        </div>
      </form>
    </Modal>
  );
}
