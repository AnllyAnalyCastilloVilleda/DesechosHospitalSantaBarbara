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
    : "https://desechoshospitalsantabarbara-production.up.railway.app";
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

// Control de 401 / errores
let IS_REDIRECTING_401 = false;
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status ?? 0;
    const code = err?.code;
    const dataMsg = err?.response?.data?.mensaje || err?.response?.data?.message;

    let message =
      dataMsg ||
      err?.message ||
      (status === 0 ? "No se pudo conectar con el servidor" : "Error al comunicarse con el servidor");

    if (code === "ECONNABORTED")       message = "Tiempo de espera agotado. Intenta de nuevo.";
    else if (status === 403 && !dataMsg) message = "Permisos insuficientes para realizar esta acción.";
    else if (status === 404 && !dataMsg) message = "Recurso no encontrado.";
    else if (status >= 500 && !dataMsg) message = "Error interno del servidor.";

    if (status === 401) {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        localStorage.removeItem("permisos");
      } catch {}
      delete http.defaults.headers.common.Authorization;

      if (!IS_REDIRECTING_401) {
        IS_REDIRECTING_401 = true;
        const here =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/";
        if (typeof window !== "undefined") {
          const qs = new URLSearchParams({ expired: "1", next: here }).toString();
          window.location.href = `/login?${qs}`;
        }
      }
    }

    return Promise.reject({
      status,
      code,
      message,
      _raw: err?.response?.data,
    });
  }
);

// Deja el header listo si ya había token
try {
  const t = localStorage.getItem("token");
  if (t) http.defaults.headers.common.Authorization = `Bearer ${t}`;
} catch {}

export { http };
export default http;
