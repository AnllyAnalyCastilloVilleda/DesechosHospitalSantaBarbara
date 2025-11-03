// src/hooks/useScaleCable.js
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import http from "../config/api"; // axios instance (default export recomendado)

/** Util: deriva URL del backend para socket y REST */
function resolveBaseURL() {
  // Si tu axios ya tiene baseURL, úsalo.
  const fromAxios =
    (http?.defaults && typeof http.defaults.baseURL === "string"
      ? http.defaults.baseURL
      : null);
  if (fromAxios) return fromAxios.replace(/\/+$/, "");

  // Vite (por si acaso)
  const fromEnv =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    (typeof process !== "undefined" && process.env?.REACT_APP_API_URL) ||
    null;

  if (fromEnv) return String(fromEnv).replace(/\/+$/, "");

  // Misma origin (dev local)
  return `${window.location.protocol}//${window.location.hostname}:5000`;
}

const KG_PER_LB = 0.45359237;

/**
 * Hook para leer la báscula por cable vía backend (Socket.IO + REST).
 *
 * Opciones:
 *  - namespace: string del namespace del socket (default: "/")
 *  - path: ruta del socket.io si difiere (default: "/socket.io")
 *  - withAuth: si true, envía el token en auth {token} (default: true)
 *  - onWeight: callback({ valueLb, valueKg, raw, meta }) por cada lectura
 *  - autoConnectSocket: inicia socket al montar (default: true)
 *  - autoReconnect: reconecta automáticamente (default: true)
 */
export default function useScaleCable(options = {}) {
  const {
    namespace = "/",
    path = "/socket.io",
    withAuth = true,
    onWeight = null,
    autoConnectSocket = true,
    autoReconnect = true,
  } = options;

  const BASE = resolveBaseURL();

  // ======== Estado público ========
  const [connected, setConnected] = useState(false);   // socket conectado
  const [streaming, setStreaming] = useState(false);   // backend leyendo puerto serie
  const [weightLb, setWeightLb] = useState(0);
  const [weightKg, setWeightKg] = useState(0);
  const [raw, setRaw] = useState("");
  const [portInfo, setPortInfo] = useState(null);      // { path, baudRate, ... } si backend lo emite
  const [lastAt, setLastAt] = useState(null);          // Date de última lectura
  const [error, setError] = useState("");              // últimos errores amigables

  // Señal útil para UI: “todo dispuesto”
  const ready = useMemo(() => connected && streaming, [connected, streaming]);

  // ======== Socket ========
  const sockRef = useRef(null);
  const backoffRef = useRef(500); // ms para reconexión manual

  /** Crea / conecta el socket */
  const ensureSocket = useCallback(() => {
    if (sockRef.current?.connected) return sockRef.current;

    const token = withAuth ? localStorage.getItem("token") : null;

    const s = io(BASE + namespace, {
      path,
      transports: ["websocket"], // evita polling en entornos con proxies
      withCredentials: true,
      forceNew: true,
      reconnection: autoReconnect,
      // auth va en el handshake. En servers modernos es `auth`, algunos usan `extraHeaders`.
      auth: token ? { token } : undefined,
    });

    // Eventos
    s.on("connect", () => {
      setConnected(true);
      setError("");
      backoffRef.current = 500;
      // Pregunta estado actual del backend ni bien conecta
      refreshStatus().catch(() => {});
    });

    s.on("disconnect", (reason) => {
      setConnected(false);
      if (reason !== "io client disconnect" && autoReconnect) {
        // socket.io ya reintenta; aquí solo limpiamos UI
      }
    });

    s.on("connect_error", (e) => {
      setConnected(false);
      setError(e?.message || "No se pudo conectar al socket.");
    });

    // Eventos de la báscula
    s.on("scale:status", (st) => {
      // { connected: bool, streaming: bool, port?: {...} }
      if (typeof st?.connected === "boolean") setStreaming(!!st.streaming);
      if (st?.port) setPortInfo(st.port);
    });

    s.on("scale:weight", (payload) => {
      // Esperado: { value: number(lb), raw?: string, meta?: {...} }
      const valLb = typeof payload?.value === "number" ? payload.value : 0;
      const valKg = valLb * KG_PER_LB;

      setWeightLb(valLb);
      setWeightKg(valKg);
      if (payload?.raw != null) setRaw(String(payload.raw));
      setLastAt(new Date());

      // Callback hacia el componente
      if (typeof onWeight === "function") {
        onWeight({
          valueLb: valLb,
          valueKg: valKg,
          raw: payload?.raw ?? "",
          meta: payload?.meta ?? null,
        });
      }
    });

    s.on("scale:raw", ({ raw }) => {
      if (raw != null) {
        setRaw(String(raw));
        setLastAt(new Date());
      }
    });

    s.on("scale:error", (e) => {
      const msg = typeof e === "string" ? e : (e?.message || "Error en báscula.");
      setError(msg);
      // El backend podría emitir streaming=false ante errores
      refreshStatus().catch(() => {});
      // backoff progresivo si necesitamos reintentar acciones manuales
      backoffRef.current = Math.min(backoffRef.current * 2, 6000);
    });

    sockRef.current = s;
    return s;
  }, [BASE, namespace, path, withAuth, onWeight, autoReconnect]);

  // Arranca el socket automáticamente si se pide
  useEffect(() => {
    if (!autoConnectSocket) return;
    const s = ensureSocket();
    return () => {
      try {
        s?.disconnect();
      } catch {}
      sockRef.current = null;
      setConnected(false);
      setStreaming(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnectSocket, ensureSocket]);

  // ======== REST helpers ========
  const listPorts = useCallback(async () => {
    const r = await http.get("/scale/ports");
    const arr = r?.data?.ports || r?.data || [];
    return Array.isArray(arr) ? arr : [];
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const st = await http.get("/scale/status");
      const c = !!st.data?.connected;
      const str = !!st.data?.streaming;
      setStreaming(str);
      if (st.data?.port) setPortInfo(st.data.port);
      // El socket puede estar conectado aunque el backend no esté leyendo puerto.
      // `connected` refiere al socket; el “link serie” lo refleja `streaming`.
      return { socket: sockRef.current?.connected || false, serial: str, raw: st.data || {} };
    } catch (e) {
      setError("No se pudo consultar estado de la báscula.");
      return { socket: sockRef.current?.connected || false, serial: false, raw: null };
    }
  }, []);

  const connectSerial = useCallback(
    async (pathOrCfg, cfg = {}) => {
      // Permite: connectSerial("/dev/ttyUSB0", { baudRate: 9600 })
      // o connectSerial({ path:"/dev/ttyUSB0", baudRate:9600 })
      const payload =
        typeof pathOrCfg === "string" ? { path: pathOrCfg, ...cfg } : pathOrCfg;
      await http.post("/scale/connect", payload);
      await refreshStatus();
    },
    [refreshStatus]
  );

  const disconnectSerial = useCallback(async () => {
    await http.post("/scale/disconnect");
    await refreshStatus();
  }, [refreshStatus]);

  const start = useCallback(async () => {
    await http.post("/scale/start");
    await refreshStatus();
  }, [refreshStatus]);

  const stop = useCallback(async () => {
    await http.post("/scale/stop");
    await refreshStatus();
  }, [refreshStatus]);

  const tare = useCallback(async () => {
    await http.post("/scale/tare");
    // opcional: algunas básculas responden la tara por socket
  }, []);

  const zero = useCallback(async () => {
    await http.post("/scale/zero");
  }, []);

  // ======== API pública ========
  return {
    // estado
    connected,     // socket conectado
    streaming,     // backend leyendo del puerto
    ready,         // azúcar: connected && streaming
    weightLb,
    weightKg,
    raw,
    portInfo,
    lastAt,
    error,

    // acciones REST
    listPorts,
    connect: connectSerial,
    disconnect: disconnectSerial,
    start,
    stop,
    tare,
    zero,

    // control de socket manual (por si quieres)
    ensureSocket,
  };
}
