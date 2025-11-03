// src/App.js
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";

import Login from "./Login";
import Registro from "./Registro";
import Dashboard from "./Dashboard";
import Recuperar from "./Recuperar";

// Hook simple de auth leyendo localStorage
function useAuth() {
  const [usuario, setUsuario] = useState(() => {
    try { return JSON.parse(localStorage.getItem("usuario") || "null"); }
    catch { return null; }
  });
  const token = localStorage.getItem("token");

  // Sincroniza si cambia localStorage en otra pestaña
  useEffect(() => {
    const onStorage = () => {
      try { setUsuario(JSON.parse(localStorage.getItem("usuario") || "null")); }
      catch { setUsuario(null); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const cerrarSesion = () => {
    localStorage.removeItem("usuario");
    localStorage.removeItem("token");
    setUsuario(null);
  };

  return { usuario, token, setUsuario, cerrarSesion };
}

// Ruta protegida: solo deja pasar si hay token
function Protected({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/" replace />;
}

// Wrappers para inyectar navigate en tus componentes con las props esperadas
function InicioWrapper({ usuario, cerrarSesion }) {
  const navigate = useNavigate();
  return (
    <Dashboard
      usuario={usuario}
      cerrarSesion={cerrarSesion}
      irARegistro={() => navigate("/registro")}
    />
  );
}

function RegistroWrapper() {
  const navigate = useNavigate();
  return <Registro irALogin={() => navigate("/inicio")} />;
}

export default function App() {
  const { usuario, token, setUsuario, cerrarSesion } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Login */}
        <Route
          path="/"
          element={<Login onLogin={(u) => setUsuario(u)} />}
        />

        {/* Recuperar contraseña */}
        <Route path="/recuperar" element={<Recuperar />} />

        {/* Dashboard (protegido) */}
        <Route
          path="/inicio"
          element={
            <Protected>
              <InicioWrapper usuario={usuario} cerrarSesion={cerrarSesion} />
            </Protected>
          }
        />

        {/* Registro (protegido) */}
        <Route
          path="/registro"
          element={
            <Protected>
              <RegistroWrapper />
            </Protected>
          }
        />

        {/* Fallback */}
        <Route
          path="*"
          element={<Navigate to={token ? "/inicio" : "/"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
