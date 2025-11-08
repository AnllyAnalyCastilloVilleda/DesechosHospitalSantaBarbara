// frontend/src/config/api.js
import axios from "axios";

/* ================ Helpers ================ */
function readToken() {
  try {
    let raw = localStorage.getItem("token") || "";
    raw = raw.replace(/^"+|"+$/g, "");    // quita comillas
    raw = raw.replace(/^Bearer\s+/i, ""); // quita "Bearer "
    return raw.trim();
  } catch {
    return "";
  }
}

/** decode Base64URL seguro (sin usar escape/unescape) */
function base64UrlToStr(b64url = "") {
  try {
    // normaliza a base64 estándar
    let b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
    // padding
    while (b64.length % 4) b64 += "=";
    // atob
    const bin = atob(b64);
    // convierte binario -> string (UTF-8 seguro)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const dec = new TextDecoder("utf-8");
    return dec.decode(bytes);
  } catch {
    return "";
  }
}

function decodeJwtPayload(jwt = "") {
  try {
    const parts = String(jwt).split(".");
    if (parts.length < 2) return null;
    const json = base64UrlToStr(parts[1]);
    return JSON.parse(json || "{}");
  } catch {
    return null;
  }
}

function isExpired(jwt = "") {
  const pl = decodeJwtPayload(jwt);
  if (!pl || !pl.exp) return false;
  return pl.exp <= Math.floor(Date.now() / 1000);
}

/** Prefija /api si hace falta (no toca URLs absolutas ni las que ya empiezan con /api) */
function ensureApiPath(url = "") {
  if (!url) return url;
  // Absoluta → no tocar
  if (/^https?:\/\//i.test(url)) return url;
  // Empieza con slash → garantizar /api/...
  if (url.startsWith("/")) return url.startsWith("/api") ? url : "/api" + url;
  // Relativa: "usuarios/..." -> "/api/usuarios/..."
  return url.startsWith("api/") ? "/" + url : "/api/" + url;
}

/** Resuelve baseURL del backend (SIN /api) */
function resolveApiUrl() {
  const fromEnv = (process.env.REACT_APP_API_URL || process.env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, ""); // sin trailing slash
  if (fromEnv) return fromEnv;

  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  return isLocal
    ? "http://localhost:5000"
    : "https://desechoshospitalsantabarbara-production.up.railway.app";
}

/* ================ Instancia Axios ================ */
const http = axios.create({
  baseURL: resolveApiUrl(), // SIN /api → lo añade ensureApiPath
  withCredentials: false,
  timeout: 15000,
});

/* ================ Interceptores ================ */

// Inyecta token y asegura /api en rutas relativas (antes del logger)
http.interceptors.request.use((config) => {
  // 1) token
  const jwt = readToken();
  if (jwt && !isExpired(jwt)) {
    config.headers.Authorization = `Bearer ${jwt}`;
  } else {
    if (config.headers && "Authorization" in config.headers) {
      delete config.headers.Authorization;
    }
  }

  // 2) asegurar /api en rutas relativas (permite desactivarlo con noApiPrefix)
  if (!config.noApiPrefix) {
    config.url = ensureApiPath(config.url || "");
  }

  return config;
});

// Logger de salida
http.interceptors.request.use((cfg) => {
  try {
    const full = (cfg.baseURL || "") + (cfg.url || "");
    // eslint-disable-next-line no-console
    console.log("[HTTP] ->", (cfg.method || "GET").toUpperCase(), full);
  } catch {}
  return cfg;
});

// Manejo 401 + expiración con redirect (salteable con skip401Redirect)
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

    const jwt = readToken();
    const expired = isExpired(jwt);

    if ((status === 401 || expired) && !skip401Redirect && !isPublicAuth) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        localStorage.removeItem("permisos");
      } catch {}
      if (http?.defaults?.headers?.common?.Authorization) {
        delete http.defaults.headers.common.Authorization;
      }

      if (!IS_REDIRECTING_401 && typeof window !== "undefined") {
        IS_REDIRECTING_401 = true;
        const here = window.location.pathname + window.location.search;
        const qs = new URLSearchParams({
          expired: expired ? "1" : "0",
          next: here,
        }).toString();
        window.location.href = `/login?${qs}`;
      }
    }

    return Promise.reject(err);
  }
);

// Carga inicial del header Authorization (en caliente)
try {
  const jwt = readToken();
  if (jwt && !isExpired(jwt)) {
    http.defaults.headers.common.Authorization = `Bearer ${jwt}`;
  } else if (http?.defaults?.headers?.common?.Authorization) {
    delete http.defaults.headers.common.Authorization;
  }
} catch {}

// eslint-disable-next-line no-console
console.info("[API] baseURL =", http.defaults.baseURL);

/* ================ Exports ================ */
export { http };     // por si algo viejo hacía import { http }
export default http; // recomendado: import http from "./config/api";
