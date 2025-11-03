// src/App.js (Dashboard)
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import Usuario from "./Usuarios";
import Inicio from "./Inicio";
import Areas from "./Areas";
import Bolsas from "./Bolsas";
import TiposDesecho from "./TiposDesecho";
import RegistroDiario from "./RegistroDiario";
import Estadisticas from "./Estadisticas";
import CodigosQR from "./CodigosQR";
import Roles from "./Roles";

import { useAuth } from "./context/AuthProvider"; // ⬅️ usar contexto de auth

const ADMIN_BYPASS = false;

export default function Dashboard() {
  // ⬅️ Traemos usuario, permisos y logout desde el contexto
  const { user, permisos, logout } = useAuth();

  const [vista, setVista] = useState("inicio");

  // ===== Overlay del menú móvil (abre con el botón dentro del header) =====
  const [menuOverlayOpen, setMenuOverlayOpen] = useState(false);
  const toggleMenuOverlay = () => setMenuOverlayOpen((v) => !v);
  const goFromOverlay = (id) => {
    setVista(id);
    setMenuOverlayOpen(false);
  };

  // Bloquear scroll del body cuando el overlay esté abierto
  useEffect(() => {
    if (menuOverlayOpen) document.body.classList.add("no-scroll");
    else document.body.classList.remove("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [menuOverlayOpen]);

  // === Datos de rol (por si tu backend envía diferentes campos)
  const rolStr = String(user?.rol ?? user?.rolNombre ?? "").trim();
  const rolId = user?.rolId ?? user?.rol_id ?? null;

  // === Normalizamos permisos a Set (pueden venir de `permisos` del contexto o dentro de user)
  const permisosSet = useMemo(() => {
    const lista = Array.isArray(permisos)
      ? permisos
      : Array.isArray(user?.permisos)
      ? user?.permisos
      : [];
    return new Set(lista);
  }, [permisos, user?.permisos]);

  const isAdminLike =
    ["Administrador", "Superadministrador", "Admin", "Root"].includes(rolStr) ||
    [0, 1, 99].includes(Number(rolId));

  const can = (perm) => {
    if (ADMIN_BYPASS && isAdminLike) return true;
    return permisosSet.has(perm);
  };

  // Si cambias permisos desde Roles, puedes querer refrescar para volver a consultar /auth/me
  const handleUsuarioPermisosChange = () => {
    // Opcional: recargar para que el AuthProvider vuelva a /auth/me
    // setTimeout(() => window.location.reload(), 300);
  };

  // === Items de navegación dependientes de permisos (useMemo con deps correctas)
  const NAV_ITEMS = useMemo(
    () => [
      { id: "inicio", label: "Inicio", icon: "🏠" },
      ...(can("USUARIOS") ? [{ id: "usuarios", label: "Usuarios", icon: "👤" }] : []),
      ...(can("ROLES") ? [{ id: "roles", label: "Roles", icon: "⚙️" }] : []),
      ...(can("AREAS") ? [{ id: "areas", label: "Áreas", icon: "👥" }] : []),
      ...(can("BOLSAS") ? [{ id: "bolsas", label: "Bolsas", icon: "🗑️" }] : []),
      ...(can("TIPOS_DESECHO") ? [{ id: "tipos", label: "Tipos de Desecho", icon: "♻️" }] : []),
      ...(can("REGISTRO_DIARIO") ? [{ id: "registro", label: "Registro Diario", icon: "🗓️" }] : []),
      ...(can("CODIGOS_QR") ? [{ id: "qrs", label: "Códigos QR", icon: "📷" }] : []),
      ...(can("ESTADISTICAS") ? [{ id: "estadisticas", label: "Estadísticas", icon: "📊" }] : []),
    ],
    // Dependencias: si cambian los permisos o el "modo admin", recalculamos
    [permisosSet, isAdminLike]
  );

  const cambiarVista = (id) => setVista(id);

  const renderizarVista = () => {
    switch (vista) {
      case "usuarios":
        return <Usuario />;
      case "roles":
        return (
          <Roles
            usuario={user}
            onUsuarioPermisosChange={handleUsuarioPermisosChange}
          />
        );
      case "areas":
        return <Areas />;
      case "bolsas":
        return <Bolsas />;
      case "tipos":
        return <TiposDesecho />;
      case "registro":
        return <RegistroDiario />;
      case "qrs":
        return <CodigosQR />;
      case "estadisticas":
        return <Estadisticas />;
      default:
        return <Inicio usuario={user} onGo={setVista} />;
    }
  };

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="topbar-left">
          {/* Botón "tres rayas" DENTRO del header azul */}
          <button
            type="button"
            className={`mobile-fab-hamb in-topbar ${menuOverlayOpen ? "open" : ""}`}
            aria-label={menuOverlayOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOverlayOpen ? "true" : "false"}
            onClick={toggleMenuOverlay}
            title="Menú"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" fill="currentColor" />
            </svg>
          </button>

          <div className="topbar-brand">
            <img src="/logocircular.png" alt="" />
            <span>Hospital Santa Bárbara</span>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="topbar-user">
            Hola, {user?.nombre || "Administrador"}
          </span>
          <button className="btn-logout" onClick={logout /* ⬅️ del contexto */}>
            ↩️ Cerrar sesión
          </button>
        </div>
      </header>

      {/* ===== Overlay/drawer superpuesto ===== */}
      {menuOverlayOpen && (
        <>
          <div
            className="overlay-backdrop"
            onClick={() => setMenuOverlayOpen(false)}
          />
          <div className="overlay-panel" role="dialog" aria-modal="true">
            <div className="overlay-head">
              <strong>Navegación</strong>
              <button
                className="overlay-close"
                onClick={() => setMenuOverlayOpen(false)}
              >
                ✕
              </button>
            </div>
            <nav className="overlay-list" role="menu">
              {NAV_ITEMS.map((it) => (
                <button
                  key={it.id}
                  role="menuitem"
                  onClick={() => goFromOverlay(it.id)}
                  className={vista === it.id ? "active" : ""}
                >
                  <span className="ico">{it.icon}</span>
                  {it.label}
                </button>
              ))}
            </nav>
          </div>
        </>
      )}

      <div className="app-layout">
        {/* Sidebar para pantallas grandes */}
        <aside className="sidebar">
          <nav className="side-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => cambiarVista(item.id)}
                className={`nav-item ${vista === item.id ? "active" : ""}`}
              >
                <span className="nav-ico">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="main-content">
          <div className="contenido">{renderizarVista()}</div>
        </main>
      </div>
    </div>
  );
}
