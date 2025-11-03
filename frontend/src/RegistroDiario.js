// src/RegistroDiario.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./config/api";
import "./RegistroDiario.css";
import { useScannerGlobal } from "./components/useScannerGlobal";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { io } from "socket.io-client";

/* === Reporte oficial === */
import ImpresionDiaria from "./reportes/ImpresionDiaria";

/* ===== Util: fecha local YYYY-MM-DD (sin desfase UTC) ===== */
function localISO(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/* ===== Conversión lb/kg ===== */
const kgToLb = (kg) => Number(kg || 0) * 2.20462;

/* ===== Simulador en LB ===== */
function createScaleSimulatorLB({
  intervalMs = 120, baseLb = 0, stepLb = 1, jitterMin = 0.02, jitterMax = 0.12,
} = {}) {
  let valueLb = Math.max(0, Number(baseLb) || 0);
  let timer = null;
  let paused = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn(valueLb));
  const rand = (a, b) => Math.random() * (b - a) + a;
  const tick = () => { if (!paused) { valueLb = Math.max(0, valueLb + stepLb + rand(jitterMin, jitterMax)); emit(); } };
  return {
    start(){ if (!timer){ tick(); timer=setInterval(tick, intervalMs); } },
    stop(){ if (timer){ clearInterval(timer); timer=null; } },
    pause(){ paused=true; }, resume(){ paused=false; }, isPaused(){ return paused; },
    tare(){ valueLb=0; emit(); }, setLb(lb){ valueLb=Math.max(0, Number(lb)||0); emit(); },
    onData(cb){ listeners.add(cb); return ()=>listeners.delete(cb); }, getLb(){ return valueLb; },
  };
}

/* ====== Modal genérico de confirmación ====== */
function ConfirmModal({ open, title="Confirmar", message, confirmText="Sí", cancelText="Cancelar", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn-close" onClick={onCancel} aria-label="Cerrar" />
        </div>
        <div className="modal-body">{message}</div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Reporte oficial: genera PDF y cierra registro ===== */
function ReportModal({ open, onClose, defaultDateISO, openRegistroId, onClosed }) {
  const [fechaISO] = useState(defaultDateISO || localISO());
  const zoneRef = useRef(null);

  const waitFor = (predicate, timeoutMs = 5000, step = 150) =>
    new Promise(resolve => {
      const t0 = Date.now();
      const loop = () => {
        let ok = false;
        try { ok = !!predicate(); } catch {}
        if (ok || Date.now()-t0>timeoutMs) return resolve(ok);
        setTimeout(loop, step);
      };
      loop();
    });

  const blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  };

  const postMultipartOrBase64 = async (blob, filename) => {
    try {
      const fd = new FormData();
      fd.append("file", blob, filename);
      const { data } = await api.post(`/api/registro/${openRegistroId}/cerrar`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return { ok: true, pdfUrl: data?.pdfUrl || null, resumen: data?.resumen || null, registro: data?.registro || null };
    } catch (err) {
      const status = err?.response?.status;
      if (status === 400 || status === 415) {
        try {
          const dataUrl = await blobToDataURL(blob);
          const base64 = (dataUrl.split(",")[1] || dataUrl);
          const { data } = await api.post(
            `/api/registro/${openRegistroId}/cerrar`,
            { pdfBase64: base64, filename }
          );
          return { ok: true, pdfUrl: data?.pdfUrl || null, resumen: data?.resumen || null, registro: data?.registro || null };
        } catch (err2) {
          return { ok: false, error: err2 };
        }
      }
      return { ok: false, error: err };
    }
  };

  const exportarPDF = useCallback(async () => {
    try {
      const container = zoneRef.current;
      if (!container) return;

      const ready = await waitFor(
        () => container.querySelector(".rpt-table") || container.querySelector("[data-print-ready='1']")
      );
      if (!ready) throw new Error("Error generando reporte");

      const wrap = container.querySelector(".rpt-wrap");
      const target = wrap || container;

      const prevTransform = target.style.transform || "";
      const prevWidth = target.style.width || "";
      const prevMinH = target.style.minHeight || "";
      const margin = 12; // mm
      const contentWmm = 279 - margin*2;
      const contentHmm = 216 - margin*2;
      target.style.transform = "none";
      target.style.width = `${contentWmm}mm`;
      target.style.minHeight = `${contentHmm}mm`;

      const canvas = await html2canvas(target, {
        scale: 1.5,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      target.style.transform = prevTransform;
      target.style.width = prevWidth;
      target.style.minHeight = prevMinH;

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter", compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const innerMargin = 8;
      const usableW = pageW - 2 * innerMargin;
      const usableH = pageH - 2 * innerMargin;

      const ratio = Math.min(usableW / canvas.width, usableH / canvas.height);
      const imgW = canvas.width * ratio;
      const imgH = canvas.height * ratio;
      const x = (pageW - imgW) / 2;
      const y = (pageH - imgH) / 2;

      const imgData = canvas.toDataURL("image/jpeg", 0.82);
      pdf.addImage(imgData, "JPEG", x, y, imgW, imgH, undefined, "FAST");

      const blob = pdf.output("blob");
      const filename = `Hoja_oficial_${fechaISO}.pdf`;

      // 1) Descargar local
      downloadBlob(blob, filename);

      // 2) Subir y cerrar registro (si hay uno abierto)
      if (openRegistroId) {
        const res = await postMultipartOrBase64(blob, filename);
        if (!res.ok) {
          onClosed?.(openRegistroId, null, res.error, null);
        } else {
          onClosed?.(openRegistroId, res.pdfUrl || null, null, res.resumen || null);
        }
      }
    } catch (e) {
      onClosed?.(openRegistroId || 0, null, e, null);
    }
  }, [fechaISO, openRegistroId, onClosed]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      await exportarPDF();
      onClose?.();
    })();
  }, [open, exportarPDF, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" style={{ opacity: 0, pointerEvents: "none" }}>
      <div className="modal-card modal-xxl" style={{ position: "fixed", left: -10000, top: -10000 }}>
        <div className="modal-body">
          <div className="print-zone" ref={zoneRef}>
            {/* Imprimimos “por registro” (el endpoint ya suma correcto) */}
            <ImpresionDiaria registroId={openRegistroId} fechaISO={fechaISO} unidad="lb" />
          </div>
        </div>
        <style>{`.modal-xxl { max-width: 980px; }`}</style>
      </div>
    </div>
  );
}

export default function RegistroDiario() {
  const [me, setMe] = useState(null);

  // Peso: manual | simulada | cable
  const [modoPeso, setModoPeso] = useState("manual");

  // Simulada
  const simRef = useRef(null);
  const [simLb, setSimLb] = useState(0);

  // Cable (Socket + puertos)
  const [cableLb, setCableLb] = useState(0);
  const socketRef = useRef(null);
  const [ports, setPorts] = useState([]);
  const [portSel, setPortSel] = useState("");
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleRaw, setScaleRaw] = useState("");
  const cablePollRef = useRef(null); // compat

  // lector
  const scanRef = useRef(null);
  const manualInputRef = useRef(null);
  const [ultimoLeido, setUltimoLeido] = useState("");
  const lastScanRef = useRef({ txt: "", ts: 0 });

  // pendiente
  const [pending, setPending] = useState(null);
  const [pesoManual, setPesoManual] = useState("");
  const [enviando, setEnviando] = useState(false);

  // lista
  const [items, setItems] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  // Reporte / Cierre
  const [reportOpen, setReportOpen] = useState(false);
  const [ultimoPDF, setUltimoPDF] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Historial
  const [showHistorial, setShowHistorial] = useState(false);
  const [hist, setHist] = useState({ items: [], total: 0, page: 1, pageSize: 20, loading: false });
  const [filterMode, setFilterMode] = useState("dia");
  const [fDia, setFDia] = useState(localISO());
  const [fMes, setFMes] = useState(localISO().slice(0,7));
  const [fAnio, setFAnio] = useState(new Date().getFullYear().toString());
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fEncargado, setFEncargado] = useState("");
  const [confirmHistDel, setConfirmHistDel] = useState(null);

  // alertas
  const [alerts, setAlerts] = useState([]);
  const pushAlert = useCallback((type, msg) => {
    const id = Date.now() + Math.random();
    setAlerts(a => [...a, { id, type, msg }]);
    if (type !== "danger") setTimeout(() => setAlerts(a => a.filter(x => x.id !== id)), 4000);
  }, []);
  const closeAlert = (id) => setAlerts(a => a.filter(x => x.id !== id));

  const focusScanner = () => { if (scanRef.current){ scanRef.current.value=""; scanRef.current.focus(); } };

  /* ===== Carga inicial ===== */
  useEffect(() => {
    (async () => {
      try {
        const meRes = await api.get("/me");
        setMe(meRes.data || null);
      } catch (e) {
        pushAlert("danger", e?.response?.data?.mensaje || "No se pudo cargar el usuario");
      } finally { focusScanner(); }
    })();
  }, [pushAlert]);

  // Cargar items (SOLO registro ABIERTO)
  const cargarLista = useCallback(async () => {
    try {
      setCargandoLista(true);
      const { data } = await api.get("/api/registro", { params: { page:1, pageSize:200, abierto: true } });
      setItems(data?.items || []);
    } catch (e) {
      pushAlert("danger", e?.response?.data?.mensaje || "No se pudo cargar registros");
    } finally { setCargandoLista(false); }
  }, [pushAlert]);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  /* ===== Simulador ===== */
  useEffect(() => {
    if (modoPeso !== "simulada") { simRef.current?.stop?.(); simRef.current=null; setSimLb(0); return; }
    const sim = createScaleSimulatorLB({ intervalMs:120, baseLb:0, stepLb:1, jitterMin:0.02, jitterMax:0.12 });
    simRef.current = sim;
    const off = sim.onData(lb => setSimLb(lb));
    sim.start();
    return () => { off(); sim.stop(); simRef.current=null; };
  }, [modoPeso]);

  /* ===== Cable: Socket.IO + control de puertos ===== */
  useEffect(() => {
    const s = io("/", { withCredentials: true });
    socketRef.current = s;

    s.on("scale:status", st => setScaleConnected(!!st?.connected));
    s.on("scale:weight", ({ value, raw }) => {
      if (typeof value === "number") setCableLb(Number(value || 0));
      if (raw != null) setScaleRaw(raw);
    });
    s.on("scale:raw", ({ raw }) => setScaleRaw(raw));
    s.on("scale:error", (e) => {
      pushAlert("danger", `Balanza: ${e?.message || "error"}`);
      setScaleConnected(false);
    });

    return () => { try { s.disconnect(); } catch {} };
  }, [pushAlert]);

  // Cuando entro a modo "cable": listar puertos y chequear estado
  useEffect(() => {
    if (cablePollRef.current) { clearInterval(cablePollRef.current); cablePollRef.current = null; }

    if (modoPeso !== "cable") {
      setCableLb(0);
      return;
    }
    (async () => {
      try {
        const st = await api.get("/scale/status");
        setScaleConnected(!!st.data?.connected);
      } catch {}
      try {
        const { data } = await api.get("/scale/ports");
        setPorts(data?.ports || []);
      } catch (e) {
        pushAlert("danger", e?.response?.data?.mensaje || "No se pudieron listar los puertos");
      }
    })();
  }, [modoPeso, pushAlert]);

  // ====== NUEVO: helpers de conexión multi-intento y “print” ======
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const tryConnect = async (cfg) => {
    try {
      await api.post("/scale/connect", cfg);
      await sleep(500);
      const st = await api.get("/scale/status");
      return !!st.data?.connected;
    } catch {
      return false;
    }
  };

  const connectScale = async () => {
    if (!portSel) { pushAlert("info", "Selecciona un puerto primero (COMx)."); return; }

    const common = {
      path: portSel,
      baudRate: 9600,
      lineTerminator: "\r\n",
      echoIntervalMs: 0,
    };

    // 1) Intento 7E1 (muy común en básculas)
    const cfg7E1 = { ...common, dataBits: 7, parity: "even", stopBits: 1 };
    // 2) Plan B 8N1
    const cfg8N1 = { ...common, dataBits: 8, parity: "none", stopBits: 1 };

    let ok = await tryConnect(cfg7E1);
    if (!ok) ok = await tryConnect(cfg8N1);

    if (ok) {
      setScaleConnected(true);
      pushAlert("success", `Conectado a ${portSel} (${ok ? "auto" : ""})`);
      // Dispara un print inicial si el backend lo soporta
      try {
        await api.post("/scale/print", { sequence: ["P\\r\\n", "ENQ", "ESC_P"] });
      } catch (_) { /* opcional */ }
    } else {
      setScaleConnected(false);
      pushAlert("danger", "No se pudo conectar a la balanza (7E1 ni 8N1). Revisa el modo de impresión/autoprint y el cable.");
    }
  };

  const disconnectScale = async () => {
    try {
      await api.post("/scale/disconnect");
      setScaleConnected(false);
      pushAlert("success","Balanza desconectada.");
    } catch (e) {
      pushAlert("danger", e?.response?.data?.mensaje || "No se pudo desconectar");
    }
  };

  const forcePrint = async () => {
    try {
      await api.post("/scale/print", { sequence: ["P\\r\\n", "ENQ", "ESC_P"] });
      pushAlert("info", "PRINT enviado.");
    } catch (e) {
      pushAlert("danger", "El backend no expone /scale/print o la báscula no lo soporta. Usa el botón físico (papel) o activa Auto Print.");
    }
  };

  /* ===== Foco input oculto ===== */
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hasFocus()) return;
      const active = document.activeElement;
      if (active === manualInputRef.current) return;
      if (active !== scanRef.current) scanRef.current?.focus();
    }, 800);
    return () => clearInterval(id);
  }, []);

  /* ===== Auto-refresh lista ===== */
  useEffect(() => {
    const poll = setInterval(() => { cargarLista(); }, 12000);
    const onFocus = () => cargarLista();
    const onVis = () => { if (document.visibilityState === "visible") cargarLista(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cargarLista]);

  /* ===== Recargar lista (manual) ===== */
  const recargarLista = async () => {
    try {
      setCargandoLista(true);
      const { data } = await api.get("/api/registro", { params: { page:1, pageSize:200, abierto: true } });
      setItems(data?.items || []);
    } catch (e) {
      pushAlert("danger", e?.response?.data?.mensaje || "No se pudo actualizar la lista");
    } finally { setCargandoLista(false); }
  };

  /* ===== Guardar línea ===== */
  const onGuardar = useCallback(async () => {
    if (!pending?.codigo && !pending?.raw) { pushAlert("info","Escanee una etiqueta antes de guardar."); focusScanner(); return; }

    const pesoLb =
      modoPeso === "simulada" ? Number(simLb.toFixed(3)) :
      modoPeso === "cable"    ? Number(cableLb.toFixed(3)) :
      Number(String(pesoManual).replace(',', '.')) || 0;

    if (enviando) return;
    const body = pending.raw?.startsWith("{")
      ? { qr: pending.raw, pesoLb }
      : { codigo: pending.codigo, pesoLb };

    setEnviando(true);
    try {
      const { data } = await api.post("/api/registro/lineas", body);
      const nueva = data?.item || data?.linea || null;
      if (nueva) {
        setItems(prev => [{ ...nueva, _flash:true }, ...prev]);
        setTimeout(() => setItems(prev => prev.map(x => x.id===nueva.id ? ({...x,_flash:false}) : x)), 800);
        pushAlert("success","Registro guardado.");
      } else {
        await recargarLista();
      }
      setPending(null); setPesoManual(""); focusScanner();
    } catch (e) {
      const msg = e?.response?.status === 409
        ? (e?.response?.data?.mensaje || "La etiqueta ya fue usada")
        : (e?.response?.data?.mensaje || "No se pudo registrar la línea");
      pushAlert("danger", msg); focusScanner();
    } finally { setEnviando(false); }
  }, [enviando, pending, modoPeso, simLb, cableLb, pesoManual, pushAlert]);

  const onCancelar = useCallback(() => {
    setPending(null); setUltimoLeido("");
    if (modoPeso === "simulada") { simRef.current?.tare?.(); setSimLb(0); }
    if (modoPeso === "manual") { setPesoManual("0.000"); }
    focusScanner();
  }, [modoPeso]);

  /* ===== Parser lector ===== */
  function parseScanRaw(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) return { raw, codigo:null, areaId:null, bolsaId:null };
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const p=JSON.parse(raw);
        const codigo=p?.c?String(p.c):null; const areaId=p?.a?Number(p.a):null; const bolsaId=p?.b?Number(p.b):null;
        if (codigo) return { raw, codigo, areaId, bolsaId };
      } catch {}
    }
    const m1 = raw.match(/"c"\s*[:"]\s*"?([A-Z0-9]+)"/i); if (m1) return { raw, codigo:m1[1], areaId:null, bolsaId:null };
    const tokens = raw.match(/[A-Z0-9]{10,24}/g) || []; const token = tokens.find(t => t!=="HSB" && t!=="HSB_QR");
    if (token) return { raw, codigo:token, areaId:null, bolsaId:null };
    return { raw, codigo:null, areaId:null, bolsaId:null };
  }

  /* ===== Confirmar escaneo ===== */
  const commitScan = useCallback((raw) => {
    if (!raw) return;
    const now = Date.now();
    if (lastScanRef.current.txt === raw && (now - lastScanRef.current.ts < 300)) return;
    lastScanRef.current = { txt: raw, ts: now };
    const parsed = parseScanRaw(raw);
    if (parsed.codigo || (parsed.raw && parsed.raw.startsWith("{") && parsed.raw.endsWith("}"))) {
      setUltimoLeido(parsed.codigo || parsed.raw);
      setPending(parsed);
    }
    focusScanner();
  }, []);

  /* ===== Lector global (Hook) ===== */
  useScannerGlobal((obj, rawText) => {
    const raw = rawText || (obj ? JSON.stringify(obj) : "");
    if (!raw) return;
    commitScan(raw);
  });

  /* Plan B input oculto */
  const onScanChange = (e) => {
    const v = e.target.value;
    if (/\r|\n/.test(v) || (v.includes("{") && v.includes("}"))) {
      commitScan(v.replace(/[\r\n]+/g,"").trim());
      e.target.value = "";
    }
  };
  const onScanKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      commitScan(e.currentTarget.value.replace(/[\r\n]+/g,"").trim());
      e.preventDefault();
      e.currentTarget.value = "";
    }
  };

  const responsableText = useMemo(() => !me ? "" : (me.nombre ? `${me.nombre} (${me.usuario})` : me.usuario), [me]);
  const pesoDisplay =
    modoPeso === "simulada" ? simLb.toFixed(3)
    : modoPeso === "cable"   ? cableLb.toFixed(3)
    : pesoManual;

  /* ===== Detectar registro ABIERTO ===== */
  const openRegistroId = useMemo(() => {
    for (const it of items) {
      if (it?.registro?.estado === 'ABIERTO' && it?.registroId) return it.registroId;
      if (it?.registro?.estado === 'ABIERTO' && it?.registro?.id) return it.registro.id;
    }
    return null;
  }, [items]);

  /* ===== Historial: rango ===== */
  const buildRange = () => {
    let desde = "", hasta = "";
    if (filterMode === "dia" && fDia) {
      desde = `${fDia}T00:00:00`;
      hasta = `${fDia}T23:59:59`;
    } else if (filterMode === "mes" && fMes) {
      const [y,m] = fMes.split("-");
      const first = new Date(Number(y), Number(m)-1, 1);
      const last = new Date(Number(y), Number(m), 0);
      desde = `${localISO(first)}T00:00:00`;
      hasta = `${localISO(last)}T23:59:59`;
    } else if (filterMode === "anio" && fAnio) {
      const y = Number(fAnio);
      const first = new Date(y, 0, 1);
      const last = new Date(y, 11, 31);
      desde = `${localISO(first)}T00:00:00`;
      hasta = `${localISO(last)}T23:59:59`;
    } else if (filterMode === "rango" && fDesde && fHasta) {
      desde = `${fDesde}T00:00:00`;
      hasta = `${fHasta}T23:59:59`;
    }
    return { desde, hasta };
  };

  /* ===== Descargar PDF del historial con token ===== */
  const descargarHistPDF = async (url, filename = "reporte.pdf") => {
    try {
      const { data } = await api.get(url, { responseType: "blob" });
      const blob = new Blob([data], { type: "application/pdf" });
      const link = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = link; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(link); a.remove(); }, 0);
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.message || "No se pudo descargar el PDF.";
      pushAlert("danger", msg);
    }
  };

  /* ===== Historial: cargar ===== */
  const cargarHistorial = useCallback(async (page = 1) => {
    try {
      setHist(h => ({ ...h, loading: true }));
      const { desde, hasta } = buildRange();
      const params = { page, pageSize: 20 };
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      if (fEncargado) params.encargado = fEncargado;
      const { data } = await api.get("/api/registro/historial", { params });
      setHist({ items: data?.items || [], total: data?.total || 0, page: data?.page || 1, pageSize: data?.pageSize || 20, loading: false });
    } catch (e) {
      setHist(h => ({ ...h, loading: false }));
      pushAlert("danger", e?.response?.data?.mensaje || "No se pudo cargar el historial");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, fDia, fMes, fAnio, fDesde, fHasta, fEncargado, pushAlert]);

  useEffect(() => {
    if (showHistorial) cargarHistorial(1);
  }, [showHistorial, cargarHistorial]);

  const totalPages = Math.max(1, Math.ceil((hist.total || 0) / (hist.pageSize || 20)));

  return (
    <div className="rd-container">
      <h2 className="rd-title">🗓️ Registro de Desechos</h2>

      {/* Alertas */}
      <div className="mb-2">
        {alerts.map(a => (
          <div key={a.id} className={`alert alert-${a.type} alert-dismissible fade show`} role="alert">
            {a.msg}
            <button type="button" className="btn-close" aria-label="Close" onClick={() => closeAlert(a.id)} />
          </div>
        ))}
      </div>

      <div className="rd-top">
        <div className="rd-badge"><span className="rd-badge-label">Responsable:</span><span className="rd-badge-value">{responsableText || "—"}</span></div>
        <div className="rd-badge"><span className="rd-badge-label">Fecha:</span><span className="rd-badge-value">{localISO()}</span></div>

        {/* Entrada de peso */}
        {!showHistorial && (
          <>
            <div className="rd-weight-mode">
              <span>Peso:</span>
              <label className={`rd-chip ${modoPeso === "manual" ? "active" : ""}`}>
                <input type="radio" name="modoPeso" value="manual" checked={modoPeso === "manual"} onChange={() => setModoPeso("manual")} />
                Manual
              </label>
            </div>
            <div className="rd-weight-mode">
              <label className={`rd-chip ${modoPeso === "simulada" ? "active" : ""}`}>
                <input type="radio" name="modoPeso" value="simulada" checked={modoPeso === "simulada"} onChange={() => setModoPeso("simulada")} />
                Simulada
              </label>
              <label className={`rd-chip ${modoPeso === "cable" ? "active" : ""}`}>
                <input type="radio" name="modoPeso" value="cable" checked={modoPeso === "cable"} onChange={() => setModoPeso("cable")} />
                Cable
              </label>
            </div>
          </>
        )}

        {/* Acciones */}
        <div style={{ marginLeft: "auto", display:"flex", gap:8 }}>
          {ultimoPDF?.url && !showHistorial && (
            <a className="btn btn-secondary" href={ultimoPDF.url} target="_blank" rel="noreferrer">
              Descargar hoja oficial
            </a>
          )}

          {!showHistorial && openRegistroId && (
            <button
              className="btn btn-primary"
              onClick={() => setConfirmClose(true)}
              title="Genera PDF y cierra el registro actual"
              disabled={items.length === 0}
            >
              Cerrar registro
            </button>
          )}

          <button
            className="btn btn-outline"
            onClick={() => setShowHistorial(s => !s)}
            aria-pressed={showHistorial}
          >
            {showHistorial ? "Volver al registro" : "Historial de registros"}
          </button>
        </div>
      </div>

      {/* ===== Panel de conexión (solo Cable) ===== */}
      {!showHistorial && modoPeso === "cable" && (
        <div className="cable-panel" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={portSel} onChange={e=>setPortSel(e.target.value)}>
            <option value="">-- Seleccione puerto --</option>
            {ports.map(p => (
              <option key={p.path} value={p.path}>{p.friendly || p.path}</option>
            ))}
          </select>
          {scaleConnected ? (
            <button className="btn btn-danger" onClick={disconnectScale}>Desconectar</button>
          ) : (
            <button className="btn btn-primary" onClick={connectScale} disabled={!portSel}>Conectar (auto 7E1/8N1)</button>
          )}
          <button className="btn btn-ghost" onClick={forcePrint} disabled={!scaleConnected}>Forzar lectura (PRINT)</button>
          <small title={scaleRaw || ""} style={{ opacity: .7, maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Estado: {scaleConnected ? "Conectado" : "Desconectado"}{scaleRaw ? ` | Último: ${scaleRaw}` : ""}
          </small>
        </div>
      )}

      {/* ===== VISTA REGISTRO ===== */}
      {!showHistorial && (
        <>
          {/* input oculto lector */}
          <input
            ref={scanRef}
            className="hidden-scan"
            type="text"
            onChange={onScanChange}
            onKeyDown={onScanKeyDown}
            aria-hidden="true"
          />

          {/* Panel escaneo/peso/acciones */}
          <div className="rd-scan-panel">
            <div className="scan-group">
              <div className="scan-banner" onClick={focusScanner}>
                Listo para escanear etiquetas… (clic si el lector no responde)
              </div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:6 }}>
                Último leído: <code style={{color:"#111827"}}>{ultimoLeido || "—"}</code>
              </div>
              {pending?.codigo && (
                <div style={{ fontSize:13, color:"#334155", marginTop:6 }}>
                  Pendiente: <strong className="mono">{pending.codigo}</strong>
                </div>
              )}
            </div>

            <div className="peso-group">
              <label className="peso-label">Peso (lb):</label>
              <div className="peso-row">
                <input
                  ref={manualInputRef}
                  className="peso-input"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  value={pesoDisplay}
                  onChange={(e) => setPesoManual(e.target.value)}
                  disabled={modoPeso !== "manual"}
                />
                <div className="peso-actions">
                  <button className="btn btn-primary" onClick={onGuardar} disabled={!pending || enviando}>
                    Registrar basura
                  </button>
                  <button className="btn btn-ghost" onClick={onCancelar} disabled={enviando}>Cancelar</button>
                  {modoPeso === "simulada" && (
                    simRef.current?.isPaused()
                      ? <button className="btn btn-secondary" onClick={() => { simRef.current?.resume(); focusScanner(); }}>Reanudar</button>
                      : <button className="btn btn-ghost" onClick={() => { simRef.current?.pause(); focusScanner(); }}>Pausar</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Displays */}
          {modoPeso === "simulada" && (
            <div className="sim-panel">
              <div className="sim-display">
                <div className="sim-digits">{simLb.toFixed(3)}</div>
                <div className="sim-unit">lb</div>
              </div>
              <div className="sim-actions" />
            </div>
          )}
          {modoPeso === "cable" && (
            <div className="sim-panel">
              <div className="sim-display">
                <div className="sim-digits">{cableLb.toFixed(3)}</div>
                <div className="sim-unit">lb</div>
              </div>
              <div className="sim-actions" />
            </div>
          )}

          {/* Tabla */}
          <div className="rd-table-wrapper">
            <table className="rd-table">
              <thead>
                <tr>
                  <th>Hora</th><th>Código</th><th>Área</th><th>Bolsa</th><th>Tipo</th><th>Peso (lb)</th><th>Responsable</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ln) => {
                  const hora =
                    new Date(ln.creadoEn || Date.now()).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

                  const responsableCell =
                    ln.responsable?.nombre || ln.responsable?.usuario ||
                    ln.registro?.responsable?.nombre || ln.registro?.responsable?.usuario || "—";

                  const pesoLb = Number(ln.pesoLb ?? ln.peso ?? kgToLb(ln.pesoKg ?? 0));

                  return (
                    <tr key={ln.id} className={ln._flash ? "row-flash" : ""}>
                      <td>{hora}</td>
                      <td className="mono">{ln.etiqueta?.codigo || "—"}</td>
                      <td>{ln.area?.nombre || ln.area || "—"}</td>
                      <td>{ln.bolsa?.color || "—"}</td>
                      <td>{ln.tipoDesecho?.nombre || ln.tipo || "—"}</td>
                      <td className="num">{pesoLb.toFixed(3)}</td>
                      <td>{responsableCell}</td>
                      <td className="rd-actions">
                        <button
                          className="btn btn-danger"
                          onClick={() => setConfirmDel({ id: ln.id })}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!items.length && (
                  <tr><td colSpan={8} className="empty">{cargandoLista ? "Cargando..." : "Sin registros abiertos."}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== VISTA HISTORIAL ===== */}
      {showHistorial && (
        <div className="rd-historial-card">
          <div className="rd-historial-head">
            <h3>Historial de registros (PDF)</h3>

            {/* Filtros */}
            <div className="hist-filters">
              <label>
                Modo:
                <select value={filterMode} onChange={e=>setFilterMode(e.target.value)}>
                  <option value="dia">Día</option>
                  <option value="mes">Mes</option>
                  <option value="anio">Año</option>
                  <option value="rango">Rango</option>
                </select>
              </label>

              {filterMode === "dia" && (
                <label>
                  Día:
                  <input type="date" value={fDia} onChange={e=>setFDia(e.target.value)} />
                </label>
              )}

              {filterMode === "mes" && (
                <label>
                  Mes:
                  <input type="month" value={fMes} onChange={e=>setFMes(e.target.value)} />
                </label>
              )}

              {filterMode === "anio" && (
                <label>
                  Año:
                  <input type="number" min="2000" max="2100" value={fAnio} onChange={e=>setFAnio(e.target.value)} />
                </label>
              )}

              {filterMode === "rango" && (
                <>
                  <label>
                    Desde:
                    <input type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} />
                  </label>
                  <label>
                    Hasta:
                    <input type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} />
                  </label>
                </>
              )}

              <label>
                Encargado:
                <input
                  type="text"
                  placeholder="Nombre o usuario"
                  value={fEncargado}
                  onChange={e=>setFEncargado(e.target.value)}
                />
              </label>

              <button className="btn btn-primary" onClick={() => cargarHistorial(1)} disabled={hist.loading}>
                Buscar
              </button>
            </div>
          </div>

          <div className="rd-table-wrapper">
            <table className="rd-table">
              <thead>
                <tr>
                  <th>Fecha de cierre</th>
                  <th>Quién cerró</th>
                  <th>Descargar</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {hist.items.map(r => (
                  <tr key={r.id}>
                    <td>{r.cerradoAt ? new Date(r.cerradoAt).toLocaleString() : "—"}</td>
                    <td>{r.cerradoPor?.nombre || r.cerradoPor?.usuario || "—"}</td>
                    <td>
                      {r.pdfUrl
                        ? <button className="btn btn-secondary" onClick={() => descargarHistPDF(r.pdfUrl, `Registro_${r.id}.pdf`)}>Descargar</button>
                        : "—"}
                    </td>
                    <td>
                      <button className="btn btn-danger" onClick={() => setConfirmHistDel(r)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {!hist.items.length && (
                  <tr><td colSpan={4} className="empty">{hist.loading ? "Cargando..." : "Sin resultados."}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="hist-pager">
            <button className="btn btn-ghost" disabled={hist.page<=1 || hist.loading} onClick={()=>cargarHistorial(hist.page-1)}>Anterior</button>
            <span>Página {hist.page} de {Math.max(1, Math.ceil((hist.total || 0)/(hist.pageSize || 20)))}</span>
            <button className="btn btn-ghost" disabled={hist.page>=Math.max(1, Math.ceil((hist.total || 0)/(hist.pageSize || 20))) || hist.loading} onClick={()=>cargarHistorial(hist.page+1)}>Siguiente</button>
          </div>
        </div>
      )}

      {/* MODALES */}
      <ConfirmModal
        open={!!confirmDel}
        title="Eliminar registro"
        message="¿Seguro que deseas eliminar este registro y liberar la etiqueta?"
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        onConfirm={async () => {
          try {
            await api.delete(`/api/registro/lineas/${confirmDel.id}`);
            setItems(prev => prev.filter(x => x.id !== confirmDel.id));
            setConfirmDel(null);
            focusScanner();
          } catch (e) {
            pushAlert("danger", e?.response?.data?.mensaje || "No se pudo eliminar la línea");
            focusScanner();
          }
        }}
        onCancel={() => setConfirmDel(null)}
      />

      <ConfirmModal
        open={!!confirmClose}
        title="Cerrar registro"
        message="Esto generará el PDF oficial y cerrará el registro actual. ¿Deseas continuar?"
        confirmText="Sí, cerrar y generar PDF"
        cancelText="Cancelar"
        onConfirm={() => { setConfirmClose(false); setReportOpen(true); }}
        onCancel={() => setConfirmClose(false)}
      />

      {/* Confirmación para eliminar del HISTORIAL */}
      <ConfirmModal
        open={!!confirmHistDel}
        title="Eliminar del historial"
        message={
          confirmHistDel
            ? <>¿Seguro que deseas eliminar el cierre del <strong>{new Date(confirmHistDel.cerradoAt).toLocaleString()}</strong>? Esta acción borrará el PDF y no se puede deshacer.</>
            : "¿Eliminar este cierre?"
        }
        confirmText="Sí, eliminar"
        cancelText="Cancelar"
        onConfirm={async () => {
          try {
            const deletingLastOfPage = hist.items.length === 1 && hist.page > 1;
            await api.delete(`/api/registro/historial/${confirmHistDel.id}`);
            setConfirmHistDel(null);
            pushAlert("success", "Cierre eliminado del historial.");
            if (deletingLastOfPage) {
              await cargarHistorial(hist.page - 1);
            } else {
              await cargarHistorial(hist.page);
            }
          } catch (e) {
            pushAlert("danger", e?.response?.data?.mensaje || "No se pudo eliminar del historial");
          }
        }}
        onCancel={() => setConfirmHistDel(null)}
      />

      {/* Reporte oficial: genera PDF y cierra registro */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        defaultDateISO={localISO()}
        openRegistroId={openRegistroId}
        onClosed={async (id, pdfUrl, error, resumen) => {
          if (error) {
            const status = error?.response?.status;
            if (status === 409) {
              const msg = error?.response?.data?.mensaje || "No se pudo cerrar: el registro está vacío.";
              pushAlert("danger", msg);
            } else {
              const msg = error?.response?.data?.mensaje || error?.message || "No se pudo cerrar el registro.";
              pushAlert("danger", `PDF generado, pero no se pudo cerrar el registro. ${msg}`);
            }
            return;
          }
          if (pdfUrl) setUltimoPDF({ id, url: pdfUrl });
          pushAlert("success", `Registro #${id} cerrado correctamente${pdfUrl ? " (PDF guardado)" : ""}.`);
          await recargarLista();
          setShowHistorial(true);
          cargarHistorial(1);
        }}
      />
    </div>
  );
}
