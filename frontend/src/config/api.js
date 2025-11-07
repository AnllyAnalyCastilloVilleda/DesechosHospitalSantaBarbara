// src/config/api.js
import axios from "axios";

/** Resuelve baseURL */
function resolveApiUrl() {
  const fromEnv = (process.env.REACT_APP_API_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;

  // fallback: en dev local => localhost:5000; en producción => Railway
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  return isLocal
    ? "http://localhost:5000"
    : "https://desechoshospitalsantabarbara-production.up.railway.app/api";
}

const BASE_URL = resolveApiUrl();

const http = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
  timeout: 15000, // 15s
});

// Logs útiles
console.info("[API] baseURL =", http.defaults.baseURL);
http.interceptors.request.use((cfg) => {
  const full = (cfg.baseURL || "") + (cfg.url || "");
  console.log("[HTTP] ->", cfg.method?.toUpperCase(), full);
  return cfg;
});

// Inyecta token
http.interceptors.request.use((config) => {
  const t = localStorage.getItem("token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  else delete config.headers.Authorization;
  return config;
});

// Control de 401 / errores (modo clásico)
let IS_REDIRECTING_401 = false;
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const cfg    = err?.config || {};
    const url    = String(cfg?.url || "");
    const status = err?.response?.status ?? 0;

    // Permite saltar el redirect explícitamente en una petición
    // p.ej. http.post("/usuarios/login", body, { skip401Redirect: true })
    const skip401Redirect = cfg?.skip401Redirect === true;

    // Endpoints públicos que NO deben redirigir en 401
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
      delete http.defaults.headers.common.Authorization;

      if (!IS_REDIRECTING_401 && typeof window !== "undefined") {
        IS_REDIRECTING_401 = true;
        const here = window.location.pathname + window.location.search;
        const qs = new URLSearchParams({ expired: "1", next: here }).toString();
        window.location.href = `/login?${qs}`;
      }
    }

    // 👉 devolvemos el error ORIGINAL de Axios, sin transformar
    return Promise.reject(err);
  }
);

// Deja el header listo si ya había token
try {
  const t = localStorage.getItem("token");
  if (t) http.defaults.headers.common.Authorization = `Bearer ${t}`;
} catch {}

export { http };
export default http;
