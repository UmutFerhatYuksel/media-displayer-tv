import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Building2, LogOut, MonitorPlay } from 'lucide-react';
import { clsx } from 'clsx';
import { clearToken, getMe, listClinics, type ClinicSummary, type Admin } from '../api';

export default function Layout({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [clinics, setClinics] = useState<ClinicSummary[]>([]);
  const [admin, setAdmin] = useState<Admin | null>(null);

  // Klinik listesini her rota değişiminde tazele (ekleme/silme yansısın).
  useEffect(() => {
    listClinics().then((r) => setClinics(r.clinics)).catch(() => {});
  }, [loc.pathname]);
  useEffect(() => {
    getMe().then(setAdmin).catch(() => {});
  }, []);

  const activeClinic = loc.pathname.match(/^\/clinics\/([^/]+)/)?.[1];

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-glow">
            <MonitorPlay size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">MediaTV</div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Panel</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <Link
            to="/"
            className={clsx(
              'mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
              loc.pathname === '/' ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            <LayoutGrid size={17} /> Tüm Klinikler
          </Link>

          <div className="mb-2 mt-5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted/70">
            Klinikler
          </div>
          {clinics.map((c) => (
            <Link
              key={c.id}
              to={`/clinics/${c.id}`}
              className={clsx(
                'mb-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
                activeClinic === c.id ? 'bg-surface-2 font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
              )}
            >
              <Building2 size={16} className="shrink-0" />
              <span className="truncate">{c.name}</span>
              <span className="ml-auto text-[11px] text-muted/60">{c.deviceCount}</span>
            </Link>
          ))}
          {clinics.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted/60">Henüz klinik yok</p>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold uppercase text-muted">
              {admin?.email?.[0] ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{admin?.name ?? 'Yönetici'}</div>
              <div className="truncate text-[11px] text-muted">{admin?.email}</div>
            </div>
            <button
              className="btn-ghost btn btn-sm"
              title="Çıkış"
              onClick={() => {
                clearToken();
                nav('/login', { replace: true });
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="h-full flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

// Sayfa başlığı şeridi (içerik üstü).
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/80 px-8 py-5 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
