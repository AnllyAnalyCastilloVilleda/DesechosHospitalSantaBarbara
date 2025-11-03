// src/context/AuthProvider.jsx
import React from "react";
import http from "../config/api";

const AuthCtx = React.createContext(null);
export const useAuth = () => React.useContext(AuthCtx);

// 👉 mapa de permisos por rol (ajústalo a tu app)
const PERMISOS_POR_ROL = {
  Superadmin:     ["USUARIOS","ROLES","AREAS","BOLSAS","TIPOS_DESECHO","REGISTRO_DIARIO","CODIGOS_QR","ESTADISTICAS"],
  Administrador:  ["USUARIOS","ROLES","AREAS","BOLSAS","TIPOS_DESECHO","REGISTRO_DIARIO","CODIGOS_QR","ESTADISTICAS"],
  Recolector:     ["AREAS","BOLSAS","TIPOS_DESECHO","REGISTRO_DIARIO","CODIGOS_QR"],
  "Estadístico":  ["ESTADISTICAS"],
};

// 👉 función para derivar permisos si no vienen del backend
function derivarPermisosDesdeRol(u) {
  const rolNombre = u?.rol?.nombre || u?.rol || "";
  return PERMISOS_POR_ROL[rolNombre] || [];
}

async function getMe() {
  const { data } = await http.get("/usuarios/me");
  return data; // objeto usuario (ideal si también trae permisos)
}

async function postLogin(body) {
  const { data } = await http.post("/usuarios/login", body);
  return data; // { ok, token, usuario, permisos? } o 403 FIRST_CHANGE_REQUIRED
}

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null);
  const [permisos, setPermisos] = React.useState([]); // usamos array para no romper lo demás
  const [loading, setLoading] = React.useState(true);

  // Guarda usuario + permisos en estado y cache
  const setUserAndPerms = React.useCallback((u, permsFromResponse) => {
    const perms =
      Array.isArray(permsFromResponse) && permsFromResponse.length
        ? permsFromResponse
        : Array.isArray(u?.permisos) && u.permisos.length
          ? u.permisos
          : derivarPermisosDesdeRol(u);

    setUser(u || null);
    setPermisos(perms || []);
    try {
      localStorage.setItem("usuario", JSON.stringify({ ...(u || {}), permisos: perms || [] }));
      localStorage.setItem("permisos", JSON.stringify(perms || []));
    } catch {}
  }, []);

  // Refresco en background (NO cambia loading para no bloquear)
  const refreshSilencioso = React.useCallback(async () => {
    try {
      const u = await getMe();
      // Si /me no trae permisos, mantenemos los actuales
      const pCache = JSON.parse(localStorage.getItem("permisos") || "[]");
      setUserAndPerms(u, u?.permisos || pCache);
    } catch {
      // si falla, no botamos sesión; el usuario ya está dentro con cache
    }
  }, [setUserAndPerms]);

  // Hidratar desde localStorage primero (para render inmediato)
  React.useEffect(() => {
    const t = localStorage.getItem("token");
    const uCacheStr = localStorage.getItem("usuario");
    const pCacheStr = localStorage.getItem("permisos");

    if (t) {
      http.defaults.headers.common.Authorization = `Bearer ${t}`;
    }

    if (uCacheStr) {
      const uCache = JSON.parse(uCacheStr);
      const pCache = pCacheStr ? JSON.parse(pCacheStr) : uCache?.permisos || derivarPermisosDesdeRol(uCache);
      setUserAndPerms(uCache, pCache);
      setLoading(false);       // ✅ no bloqueamos
      refreshSilencioso();     // 🔄 refresco en background
    } else if (t) {
      // Hay token pero no cache (p.ej. se limpió localStorage parcial): no bloquees
      setLoading(false);
      refreshSilencioso();
    } else {
      // No hay sesión
      setLoading(false);
    }
  }, [setUserAndPerms, refreshSilencioso]);

  // Login: guarda todo y deja la app lista SIN esperar nada extra
  const login = async (cred) => {
    const data = await postLogin(cred);

    if (data?.token) {
      localStorage.setItem("token", data.token);
      http.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    }

    if (data?.usuario) {
      // Preferimos permisos del response (si vienen)
      setUserAndPerms(data.usuario, data.permisos);
    }

    // No seteamos loading aquí; ya estamos listos para navegar/renderizar
    return data;
  };

  const logout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      localStorage.removeItem("permisos");
    } catch {}
    delete http.defaults.headers.common.Authorization;
    setUser(null);
    setPermisos([]);
  };

  const refresh = refreshSilencioso;

  return (
    <AuthCtx.Provider value={{ user, permisos, loading, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}
