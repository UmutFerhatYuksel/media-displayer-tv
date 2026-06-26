import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import { getToken } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Clinics from './pages/Clinics';
import ClinicDetail from './pages/ClinicDetail';
import GalleryEditor from './pages/GalleryEditor';

function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <Protected><Clinics /></Protected> },
  { path: '/clinics/:id', element: <Protected><ClinicDetail /></Protected> },
  { path: '/galleries/:id', element: <Protected><GalleryEditor /></Protected> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster theme="dark" position="bottom-right" richColors closeButton />
  </React.StrictMode>,
);
