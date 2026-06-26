import { useNavigate } from 'react-router-dom';
import { clearToken } from '../api';

export default function TopBar({ title, back }: { title: string; back?: string }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <div className="row">
        {back && <button onClick={() => nav(back)}>← Geri</button>}
        <h1>{title}</h1>
      </div>
      <button
        onClick={() => {
          clearToken();
          nav('/login', { replace: true });
        }}
      >
        Çıkış
      </button>
    </div>
  );
}
