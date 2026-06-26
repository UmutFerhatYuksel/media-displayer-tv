import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { X, Loader2 } from 'lucide-react';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

export function Button({
  variant = 'default',
  size,
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm';
  loading?: boolean;
}) {
  return (
    <button
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'danger' && 'btn-danger',
        variant === 'ghost' && 'btn-ghost',
        size === 'sm' && 'btn-sm',
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('card', className)}>{children}</div>;
}

export function Badge({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'ok' | 'warn' | 'primary';
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'badge',
        tone === 'ok' && 'border-ok/30 text-ok',
        tone === 'warn' && 'border-accent/30 text-accent',
        tone === 'primary' && 'border-primary/30 text-primary',
        className,
      )}
    >
      {children}
    </span>
  );
}

// Cihaz canlılık göstergesi: son görülme < 2dk ise çevrimiçi.
export function StatusDot({ online, label }: { online: boolean; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
        )}
        <span className={clsx('relative inline-flex h-2.5 w-2.5 rounded-full', online ? 'bg-ok' : 'bg-muted/50')} />
      </span>
      {label && <span className={clsx('text-xs', online ? 'text-ok' : 'text-muted')}>{online ? 'Çevrimiçi' : 'Çevrimdışı'}</span>}
    </span>
  );
}

export function Modal({
  title,
  children,
  onClose,
  width = 440,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full animate-scale-in rounded-2xl border border-border bg-surface shadow-card"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost btn btn-sm" onClick={onClose} aria-label="Kapat">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-xl bg-surface-2', className)}>
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent [animation:shimmer_1.4s_infinite]" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>
      <p className="font-medium text-text">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// "x dk önce" gibi göreli zaman + çevrimiçi eşiği (2 dk).
export function lastSeen(iso?: string | null): { online: boolean; text: string } {
  if (!iso) return { online: false, text: 'hiç' };
  const diff = Date.now() - new Date(iso).getTime();
  const online = diff < 2 * 60_000;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return { online, text: 'az önce' };
  if (m < 60) return { online, text: `${m} dk önce` };
  const h = Math.floor(m / 60);
  if (h < 24) return { online, text: `${h} sa önce` };
  return { online, text: `${Math.floor(h / 24)} gün önce` };
}
