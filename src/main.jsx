import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Quick check env vars
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  document.getElementById('root').innerHTML = `
    <div style="padding:40px;text-align:center;color:#e8e9ed;font-family:sans-serif">
      <h2 style="color:#f06060">⚠️ Faltan variables de entorno</h2>
      <p style="margin-top:12px;color:#8a8fa4;font-size:13px">
        Configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en Vercel.
      </p>
    </div>`;
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
