// frontend/src/config/api.js
import axios from "axios";

/** Resuelve la base URL del backend (SIN /api) */
function resolveApiUrl() {
  // Lee de variables de entorno (Netlify/Cra/Vite)
  const fromEnv = (process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, ""); // quita slashes al final

  if (fromEnv) return fromEnv; // ⬅️ debe venir SIN /api

  // Fallback: dev local vs producción (Railway)
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  return isLocal
    ? "http://localhost:5000" // ⬅️ sin /api
    : "https://desechoshospitalsantabarbara-production.up.railway.app"; // ⬅️ sin /api
}

const BASE_URL = resolveApiUrl();

const http = axios.create({
  baseURL: BASE_URL, // ⬅️ SIN /api
  withCredentials: false,
  timeout: 15000,
});

/* ================= Interceptores ================= */

// Inyecta token ANTES del logger
http.interceptors.request.use((config) => {
  try {
    const t = localStorage.getItem("token");
    if (t) config.headers.Authorization = `Bearer ${t}`;
    else delete config.headers.Authorization;
  } catch {
    // ignore
  }
  return config;
});

// Logger útil en dev
http.interceptors.request.use((cfg) => {
  try {
    const full = (cfg.baseURL || "") + (cfg.url || "");
    // eslint-disable-next-line no-console
    console.log("[HTTP] ->", (cfg.method || "GET").toUpperCase(), full);
  } catch {}
  return cfg;
});

// Manejo de 401
let IS_REDIRECTING_401 = false;
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const cfg = err?.config || {};
    const url = String(cfg?.url || "");
    const status = err?.response?.status ?? 0;

    const skip401Redirect = cfg?.skip401Redirect === true;

    // Rutas públicas (no redirigir)
    const isPublicAuth =
      url.endsWith("/login") ||
      url.endsWith("/usuarios/login") ||
      url.endsWith("/auth/recuperar") ||
      url.endsWith("/usuarios/recuperar") ||
      /\/usuarios\/\d+\/validar-nueva$/.test(url);

    if (status === 401 && !skip401Redirect && !isPublicAuth) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        localStorage.removeItem("permisos");
      } catch {}
      delete http.defaults.headers.common?.Authorization;

      if (!IS_REDIRECTING_401 && typeof window !== "undefined") {
        IS_REDIRECTING_401 = true;
        const here = window.location.pathname + window.location.search;
        const qs = new URLSearchParams({ expired: "1", next: here }).toString();
        window.location.href = `/login?${qs}`;
      }
    }

    return Promise.reject(err);
  }
);

// Si ya hay token guardado, deja el default
try {
  const t = localStorage.getItem("token");
  if (t) http.defaults.headers.common.Authorization = `Bearer ${t}`;
} catch {
  // ignore
}

// Info visible una vez
// eslint-disable-next-line no-console
console.info("[API] baseURL =", http.defaults.baseURL);

export { http };
export default http;
