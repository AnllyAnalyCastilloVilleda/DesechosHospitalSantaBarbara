import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './Roles.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { AuthProvider, useAuth } from './context/AuthProvider'; // ⬅️ importa el provider

function Gate() {
  const { loading } = useAuth();
  if (loading) return <div style={{ padding: 24 }}>Cargando permisos…</div>;
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AuthProvider>
      <Gate />
    </AuthProvider>
  </React.StrictMode>
);
