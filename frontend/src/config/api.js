// src/config/api.js
import axios from "axios";

/** Asegura que la URL termine con /api (una sola vez) */
function withApiSuffix(url = "") {
  const base = String(url || "").trim().replace(/\/+$/, ""); // sin slashes al final
  return base.endsWith("/api") ? base : `${base}/api`;
}

/** Resuelve baseURL final (con /api) */
function resolveApiUrl() {
  const fromEnv = (process.env.REACT_APP_API_URL || "").trim();
  if (fromEnv) {
    // Si en el env ya pusiste .../api, se respeta; si no, se agrega
    return withApiSuffix(fromEnv);
  }

  // Fallback: en dev → localhost:5000/api ; en prod → Railway/api
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  return isLocal
    ? withApiSuffix("http://localhost:5000")
    : withApiSuffix("https://desechoshospitalsantabarbara-production.up.railway.app");
}

const BASE_URL = resolveApiUrl();

const http = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
  timeout: 15000, // 15s
});

/* ===== Interceptores ===== */

// Inyecta token ANTES del logger (opcional, pero así ya va listo al momento de loguear)
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

// Logs útiles
console.info("[API] baseURL =", http.defaults.baseURL);
http.interceptors.request.use((cfg) => {
  const full = (cfg.baseURL || "") + (cfg.url || "");
  console.log("[HTTP] ->", (cfg.method || "GET").toUpperCase(), full);
  return cfg;
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
      delete http.defaults.headers.common?.Authorization;

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
} catch {
  // ignore
}

export { http };
export default http;

