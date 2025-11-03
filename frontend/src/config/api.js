// src/config/api.js
import axios from "axios";

/**
 * Resuelve la URL base del backend.
 * - Vite: VITE_API_URL
 * - CRA:  REACT_APP_API_URL
 * - Default: http://localhost:5000
 */
function resolveApiUrl() {
  // Vite
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // CRA
  if (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  // Por defecto (dev local)
  return "http://localhost:5000";
}

const BASE_URL = resolveApiUrl();

const http = axios.create({
  baseURL: BASE_URL,
  // SIN cookies; usamos Bearer token en header
  withCredentials: false,
  // evita loaders infinitos si el backend no responde
  timeout: 5000, // 5s
});

// Log útil en dev
try {
  if (typeof import.meta !== "undefined" && import.meta?.env?.DEV) {
    // eslint-disable-next-line no-console
    console.log("[API] baseURL =", BASE_URL);
  }
} catch {}

// Inyecta el token en cada request
http.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) {
    config.headers.Authorization = `Bearer ${t}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

// Evita redirecciones múltiples simultáneas en 401
let IS_REDIRECTING_401 = false;

// Manejo centralizado de errores (auth, timeouts, red, etc.)
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status ?? 0;
    const code = err?.code; // 'ECONNABORTED' = timeout
    const dataMsg = err?.response?.data?.mensaje || err?.response?.data?.message;

    // Mensaje base
    let message =
      dataMsg ||
      err?.message ||
      (status === 0 ? "No se pudo conectar con el servidor" : "Error al comunicarse con el servidor");

    // Mejorar mensaje por casos típicos
    if (code === "ECONNABORTED") {
      message = "Tiempo de espera agotado. Intenta de nuevo.";
    } else if (status === 403 && !dataMsg) {
      message = "Permisos insuficientes para realizar esta acción.";
    } else if (status === 404 && !dataMsg) {
      message = "Recurso no encontrado.";
    } else if (status >= 500 && !dataMsg) {
      message = "Error interno del servidor.";
    }

    // 401: token inválido/expirado — limpiar y redirigir una sola vez
    if (status === 401) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        localStorage.removeItem("permisos");
      } catch {}
      delete http.defaults.headers.common.Authorization;

      // Redirige a /login solo una vez para evitar bucles
      if (!IS_REDIRECTING_401) {
        IS_REDIRECTING_401 = true;
        // Conserva a dónde estaba para volver después (opcional)
        const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
        if (typeof window !== "undefined") {
          const qs = new URLSearchParams({ expired: "1", next: here }).toString();
          window.location.href = `/login?${qs}`;
        }
      }
    }

    // Normaliza el error para las vistas
    const normalized = {
      status,
      code,
      message,
      // útil si la UI quiere saber más
      _raw: err?.response?.data,
    };

    return Promise.reject(normalized);
  }
);

// Si hay token guardado antes de montar el AuthProvider, deja el header listo
try {
  const t = localStorage.getItem("token");
  if (t) http.defaults.headers.common.Authorization = `Bearer ${t}`;
} catch {}

export { http };
export default http;
