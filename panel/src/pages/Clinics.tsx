import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Plus, Trash2, MonitorPlay, Images, FileImage, ArrowRight } from 'lucide-react';
import { listClinics, createClinic, deleteClinic, type ClinicSummary } from '../api';
import { PageHeader } from '../components/Layout';
import { Button, Card, EmptyState, Modal, Skeleton } from '../ui';

export default function Clinics() {
  const [clinics, setClinics] = useState<ClinicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setClinics((await listClinics()).clinics);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(c: ClinicSummary) {
    if (!confirm(`"${c.name}" klinik silinsin mi? Tüm cihaz, galeri ve medyası silinir.`)) return;
    await deleteClinic(c.id);
    toast.success(`"${c.name}" silindi`);
    load();
  }

  return (
    <>
      <PageHeader
        title="Klinikler"
        subtitle={loading ? 'Yükleniyor…' : `${clinics.length} klinik`}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Klinik ekle
          </Button>
        }
      />

      <div className="p-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : clinics.length === 0 ? (
          <EmptyState
            icon={<Building2 size={26} />}
            title="Henüz klinik yok"
            hint="İlk kliniğinizi ekleyin, ardından içine cihaz bağlayıp galeri atayın."
            action={<Button variant="primary" onClick={() => setAdding(true)}><Plus size={16} /> Klinik ekle</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clinics.map((c) => (
              <Card key={c.id} className="group transition hover:border-border-strong hover:shadow-glow">
                <div className="flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-primary">
                    <Building2 size={22} />
                  </div>
                  <button
                    className="btn-ghost btn btn-sm opacity-0 transition group-hover:opacity-100"
                    onClick={() => remove(c)}
                    title="Sil"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <Link to={`/clinics/${c.id}`} className="mt-3 block">
                  <h3 className="text-base font-semibold text-text">{c.name}</h3>
                  {c.address && <p className="mt-0.5 truncate text-sm text-muted">{c.address}</p>}
                </Link>
                <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5"><MonitorPlay size={14} /> {c.deviceCount}</span>
                  <span className="inline-flex items-center gap-1.5"><Images size={14} /> {c.galleryCount}</span>
                  <span className="inline-flex items-center gap-1.5"><FileImage size={14} /> {c.mediaCount}</span>
                  <Link to={`/clinics/${c.id}`} className="ml-auto inline-flex items-center gap-1 text-primary opacity-0 transition group-hover:opacity-100">
                    Aç <ArrowRight size={14} />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {adding && <AddClinicModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

function AddClinicModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createClinic(name.trim(), address.trim() || undefined);
      toast.success(`"${name.trim()}" eklendi`);
      onDone();
    } catch {
      toast.error('Klinik eklenemedi');
      setBusy(false);
    }
  }

  return (
    <Modal title="Yeni klinik" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="label">Ad</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus required placeholder="Merkez Klinik" />
        <label className="label mt-4">Adres (opsiyonel)</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="İl / ilçe" />
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>İptal</Button>
          <Button variant="primary" loading={busy}>Ekle</Button>
        </div>
      </form>
    </Modal>
  );
}
