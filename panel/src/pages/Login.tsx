import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay } from 'lucide-react';
import { login, setToken } from '../api';
import { Button } from '../ui';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { token } = await login(email, password);
      setToken(token);
      nav('/', { replace: true });
    } catch {
      setErr('E-posta veya şifre hatalı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-4">
      {/* Ambient sıcak ışık */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      <form onSubmit={submit} className="relative w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-surface/80 p-8 shadow-card backdrop-blur">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-glow">
            <MonitorPlay size={24} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">MediaTV Panel</h1>
            <p className="text-sm text-muted">Yönetici girişi</p>
          </div>
        </div>

        <label className="label">E-posta</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />

        <label className="label mt-4">Şifre</label>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {err && <p className="mt-3 text-sm text-danger">{err}</p>}

        <Button variant="primary" className="mt-6 w-full" loading={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </Button>
      </form>
    </div>
  );
}
