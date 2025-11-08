// frontend/src/config/api.js
import axios from "axios";

/* ================ Helpers de token ================ */

/** Lee y normaliza el token del localStorage */
function readToken() {
  try {
    let raw = localStorage.getItem("token") || "";
    // quita comillas si lo guardaron como JSON.stringify(token)
    raw = raw.replace(/^"+|"+$/g, "");
    // si viene "Bearer xxx" deja solo el jwt
    raw = raw.replace(/^Bearer\s+/i, "");
    return raw.trim();
  } catch {
    return "";
  }
}

/** Decodifica (best-effort) el payload del JWT para ver exp */
function decodeJwtPayload(jwt = "") {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

/** Devuelve true si el token está caducado (exp < ahora) */
function isExpired(jwt = "") {
  const p = decodeJwtPayload(jwt);
  if (!p || !p.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return p.exp <= now;
}

/* ================ Resolución de baseURL ================ */

/** Resuelve la base URL del backend (SIN /api) */
function resolveApiUrl() {
  const fromEnv = (process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, ""); // sin slash final
  if (fromEnv) return fromEnv;

  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  return isLocal
    ? "http://localhost:5000"
    : "https://desechoshospitalsantabarbara-production.up.railway.app";
}

const BASE_URL = resolveApiUrl();

const http = axios.create({
  baseURL: BASE_URL, // SIN /api; las rutas sí empiezan con /api
  withCredentials: false,
  timeout: 15000,
});

/* ================ Interceptores ================ */

// Inyecta token (normalizado) ANTES del logger
http.interceptors.request.use((config) => {
  const jwt = readToken();
  if (jwt && !isExpired(jwt)) {
    config.headers.Authorization = `Bearer ${jwt}`;
  } else {
    // asegúrate de no mandar Authorization inválido
    delete config.headers.Authorization;
  }
  return config;
});

// Logger útil
http.interceptors.request.use((cfg) => {
  try {
    const full = (cfg.baseURL || "") + (cfg.url || "");
    // eslint-disable-next-line no-console
    console.log("[HTTP] ->", (cfg.method || "GET").toUpperCase(), full);
  } catch {}
  return cfg;
});

// Manejo de 401 y expiración
let IS_REDIRECTING_401 = false;
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const cfg = err?.config || {};
    const url = String(cfg?.url || "");
    const status = err?.response?.status ?? 0;

    const skip401Redirect = cfg?.skip401Redirect === true;

    const isPublicAuth =
      url.endsWith("/login") ||
      url.endsWith("/usuarios/login") ||
      url.endsWith("/auth/recuperar") ||
      url.endsWith("/usuarios/recuperar") ||
      /\/usuarios\/\d+\/validar-nueva$/.test(url);

    // si recibimos 401 o detectamos token expirado, limpiamos y redirigimos
    const jwt = readToken();
    const expired = isExpired(jwt);

    if ((status === 401 || expired) && !skip401Redirect && !isPublicAuth) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        localStorage.removeItem("permisos");
      } catch {}
      delete http.defaults.headers.common?.Authorization;

      if (!IS_REDIRECTING_401 && typeof window !== "undefined") {
        IS_REDIRECTING_401 = true;
        const here = window.location.pathname + window.location.search;
        const params = { expired: expired ? "1" : "0", next: here };
        const qs = new URLSearchParams(params).toString();
        window.location.href = `/login?${qs}`;
      }
    }

    return Promise.reject(err);
  }
);

// Carga inicial del header por si ya había token
try {
  const jwt = readToken();
  if (jwt && !isExpired(jwt)) {
    http.defaults.headers.common.Authorization = `Bearer ${jwt}`;
  } else {
    delete http.defaults.headers.common?.Authorization;
  }
} catch {}

// eslint-disable-next-line no-console
console.info("[API] baseURL =", http.defaults.baseURL);

export { http };
export default http;
