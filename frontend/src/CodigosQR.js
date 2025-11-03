// src/CodigosQR.js
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import api from "./config/api";
import FancySelect from "./components/FancySelect";   // ⬅️ nuevo
import "./CodigosQR.css";

const OPCIONES = [1, 2, 4, 6, 8, 10, 12];

function qrSizeFor(n) {
  switch (Number(n)) {
    case 1: return 320;
    case 2: return 280;
    case 4: return 220;
    case 6: return 190;
    case 8: return 170;
    case 10: return 150;
    case 12: return 130;
    default: return 180;
  }
}

// helpers para texto compacto
const stripDesechos = (s) => (s || "").replace(/^desechos?\s+/i, "");
const truncate = (s, n) => {
  const str = s || "";
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
};

export default function CodigosQR() {
  const [tab, setTab] = useState("generar");

  // Catálogos
  const [areas, setAreas] = useState([]);
  const [bolsas, setBolsas] = useState([]);
  const [tipos, setTipos] = useState([]);

  // Selecciones
  const [areaId, setAreaId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [bolsaId, setBolsaId] = useState("");
  const [porHoja, setPorHoja] = useState(8);

  // Generación/preview
  const [generando, setGenerando] = useState(false);
  const [lote, setLote] = useState(null);
  const [preview, setPreview] = useState([]);

  // Historial
  const [lotes, setLotes] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [filtroAreaId, setFiltroAreaId] = useState(0);
  const [filtroBolsaId, setFiltroBolsaId] = useState(0);

  // Modal eliminar
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loteToDelete, setLoteToDelete] = useState(null);

  // ALERTA (toast centrado)
  const [alerta, setAlerta] = useState({ open: false, tipo: "warning", msg: "" });
  const alertaTimerRef = useRef(null);
  const showAlert = (msg, tipo = "warning", ms = 3500) => {
    setAlerta({ open: true, tipo, msg });
    if (alertaTimerRef.current) clearTimeout(alertaTimerRef.current);
    alertaTimerRef.current = setTimeout(() => {
      setAlerta((a) => ({ ...a, open: false }));
    }, ms);
  };
  useEffect(() => () => { if (alertaTimerRef.current) clearTimeout(alertaTimerRef.current); }, []);

  // Helpers
  const areaSel  = useMemo(() => areas.find((a) => Number(a.id) === Number(areaId)), [areas, areaId]);
  const tipoSel  = useMemo(() => tipos.find((t) => Number(t.id) === Number(tipoId)), [tipos, tipoId]);
  const bolsasFiltradas = useMemo(() => {
    if (!tipoId) return bolsas;
    return bolsas.filter((b) => Number(b.tipoDesechoId) === Number(tipoId));
  }, [bolsas, tipoId]);
  const bolsaSel = useMemo(() => bolsas.find((b) => Number(b.id) === Number(bolsaId)), [bolsas, bolsaId]);
  const qrPx = useMemo(() => qrSizeFor(porHoja), [porHoja]);
  const etiquetaBolsa = (b) => (b ? `${b.color}` : "");

  /* =========================
     Carga inicial (áreas y bolsas)
     ========================= */
  useEffect(() => {
    (async () => {
      try {
        const [A, B] = await Promise.all([api.get("/areas"), api.get("/bolsas")]);
        const areasData  = (A.data || []).filter((x) => x.estado !== false);
        const bolsasData = (B.data || []).filter((x) => x.estado !== false);

        setAreas(areasData);
        setBolsas(bolsasData);

        if (areasData.length) {
          const firstAreaId = Number(areasData[0].id);
          setAreaId(firstAreaId);
          setFiltroAreaId(firstAreaId); // filtro por defecto en historial
        }
      } catch (e) {
        console.error(e);
        showAlert(e?.response?.data?.mensaje || "No se pudieron cargar áreas/bolsas", "danger");
      }
    })();
  }, []);

  /* =========================
     Al cambiar de área, cargar tipos permitidos
     ========================= */
  useEffect(() => {
    if (!areaId) { setTipos([]); setTipoId(""); return; }

    let cancel = false;
    (async () => {
      try {
        // nuevo endpoint: solo tipos permitidos por el área
        const { data } = await api.get("/qr/tipos", { params: { areaId: Number(areaId) } });
        const tiposActivos = (data || []).filter((t) => t.estado !== false);
        if (cancel) return;

        setTipos(tiposActivos);

        // Seleccionar primer tipo permitido; la bolsa válida la ajusta el otro effect ([tipoId, bolsas])
        if (tiposActivos.length) {
          setTipoId(Number(tiposActivos[0].id));
        } else {
          setTipoId("");
          setBolsaId("");
        }
      } catch (e) {
        console.error(e);
        if (!cancel) {
          setTipos([]);
          setTipoId("");
          setBolsaId("");
          showAlert("No se pudieron cargar los tipos para el área seleccionada.", "danger");
        }
      }
    })();

    return () => { cancel = true; };
  }, [areaId]);

  /* =========================
     Si cambia el tipo, forzar una bolsa válida de ese tipo
     ========================= */
  useEffect(() => {
    if (!tipoId) { setBolsaId(""); return; }
    const match = bolsas.find((b) => Number(b.tipoDesechoId) === Number(tipoId));
    setBolsaId(match ? Number(match.id) : "");
  }, [tipoId, bolsas]);

  // Reset preview al cambiar cualquier selección
  useEffect(() => { setPreview([]); setLote(null); }, [areaId, tipoId, bolsaId, porHoja]);

  /* =========================
     Historial
     ========================= */
  const cargarLotes = useCallback(async (p = 1) => {
    try {
      setCargandoLotes(true);
      const params = { page: p, pageSize };
      if (Number(filtroAreaId) > 0) params.areaId = Number(filtroAreaId);
      if (Number(filtroBolsaId) > 0) params.bolsaId = Number(filtroBolsaId);

      const { data } = await api.get("/qr/lotes", { params });
      setLotes(data.items || []);
      setTotal(data.total || 0);
      setPage(data.page || p);
    } catch (e) {
      console.error(e);
      showAlert(e?.response?.data?.mensaje || "Error listando lotes", "danger");
    } finally {
      setCargandoLotes(false);
    }
  }, [filtroAreaId, filtroBolsaId, pageSize]);

  useEffect(() => { cargarLotes(1); }, [cargarLotes]);

  const irA = (p) => {
    const pg = Math.min(Math.max(1, p), totalPages);
    setPage(pg);
    cargarLotes(pg);
  };

  /* =========================
     PDF local (jsPDF)
     ========================= */
  const descargarPDFLocal = async ({
    etiquetas,           // [{codigo, dataUrl}]
    porHojaValue,
    areaTxt,
    bolsaTxt,
    tipoTxt,
    nombreArchivo = "QR_local.pdf",
  }) => {
    if (!etiquetas?.length) {
      showAlert("Genera primero el lote para crear el PDF.", "warning");
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const cols = porHojaValue === 10 ? 5 : porHojaValue === 12 ? 4 : 4;
    const rows = Math.ceil(porHojaValue / cols);

    const margin = 36;
    const gapX = 14;
    const gapY = 14;

    const usableW = pageW - margin * 2 - gapX * (cols - 1);
    const usableH = pageH - margin * 2 - gapY * (rows - 1);
    const cardW = usableW / cols;
    const cardH = usableH / rows;
    const pad = 12;

    const qrSize = porHojaValue === 12 ? 130 : porHojaValue === 10 ? 150 : 170;
    const fs = porHojaValue >= 12 ? 9.6 : porHojaValue >= 10 ? 10.0 : 11.0;
    const lineLead = porHojaValue >= 12 ? 4.2 : porHojaValue >= 10 ? 5.2 : 3.6;
    const showTipo = porHojaValue < 10;

    const ellipsis = (text, maxWidth) => {
      let t = text || "";
      while (doc.getTextWidth(t) > maxWidth && t.length > 1) {
        t = t.slice(0, -2) + "…";
      }
      return t;
    };

    const line = (txt, x, y, maxW) => {
      doc.setFont("helvetica", "normal");
      doc.text(ellipsis(txt, maxW), x + maxW / 2, y, { align: "center", baseline: "top" });
    };

    etiquetas.forEach((et, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const x = margin + c * (cardW + gapX);
      const y = margin + r * (cardH + gapY);

      doc.setDrawColor(210);
      doc.roundedRect(x, y, cardW, cardH, 12, 12);

      const qrX = x + (cardW - qrSize) / 2;
      const qrY = y + 14;
      doc.addImage(et.dataUrl, "PNG", qrX, qrY, qrSize, qrSize);

      let ty = qrY + qrSize + 10;
      const maxW = cardW - pad * 2;
      doc.setFontSize(fs);

      line(`Área: ${areaTxt}`, x + pad, ty, cardW - pad * 2); ty += fs + lineLead;
      line(`Bolsa: ${bolsaTxt}`, x + pad, ty, cardW - pad * 2); ty += fs + lineLead;
      if (showTipo) { line(`Tipo: ${tipoTxt || "—"}`, x + pad, ty, cardW - pad * 2); ty += fs + lineLead; }

      doc.setFont("courier", "normal");
      line(et.codigo, x + pad, ty, cardW - pad * 2);
    });

    doc.save(nombreArchivo);
  };

  /* =========================
     Generar
     ========================= */
  const generar = async () => {
    try {
      if (!areaId)  return showAlert("Selecciona un área.", "warning");
      if (!tipoId)  return showAlert("Selecciona un tipo de desecho.", "warning");
      if (!bolsaId) return showAlert("Selecciona una bolsa.", "warning");

      if (bolsaSel && Number(bolsaSel.tipoDesechoId) !== Number(tipoId)) {
        return showAlert("La bolsa seleccionada no corresponde al tipo de desecho elegido.", "warning");
      }

      setGenerando(true);
      setPreview([]);
      setLote(null);

      const { data } = await api.post("/qr/generar", {
        areaId: Number(areaId),
        bolsaId: Number(bolsaId),
        tipoDesechoId: Number(tipoId),
        porHoja: Number(porHoja),
        cantidad: Number(porHoja),
      });

      setLote(data);

      const outs = [];
      for (const e of data.etiquetas) {
        const payload = JSON.stringify({ t: "HSB_QR", c: e.codigo, a: data.area.id, b: data.bolsa.id });
        const dataUrl = await QRCode.toDataURL(payload, { width: qrPx });
        outs.push({ codigo: e.codigo, dataUrl });
      }
      setPreview(outs);

      cargarLotes(1);
      setTab("historial");
      showAlert("Lote generado correctamente.", "success", 2500);
    } catch (e) {
      console.error(e);
      showAlert(e?.response?.data?.mensaje || "Error generando QR", "danger");
    } finally {
      setGenerando(false);
    }
  };

  /* =========================
     Descargar PDF del lote actual
     ========================= */
  const descargarPDFActual = async () => {
    if (!lote?.loteId) return;

    const porHojaValue = Number(lote?.porHoja || porHoja);
    if (porHojaValue === 10) {
      try {
        let etiquetas = preview;
        if (!etiquetas?.length && lote?.etiquetas?.length) {
          const outs = [];
          for (const e of lote.etiquetas) {
            const payload = JSON.stringify({ t: "HSB_QR", c: e.codigo, a: lote.area.id, b: lote.bolsa.id });
            const dataUrl = await QRCode.toDataURL(payload, { width: qrSizeFor(porHojaValue) });
            outs.push({ codigo: e.codigo, dataUrl });
          }
          etiquetas = outs;
        }

        const compactLevel = porHojaValue >= 12 ? 3 : porHojaValue >= 10 ? 2 : porHojaValue >= 8 ? 1 : 0;
        const areaTxt  = compactLevel ? truncate(lote?.area?.nombre || "", 18) : (lote?.area?.nombre || "");
        const bolsaTxt = compactLevel ? truncate(lote?.bolsa?.color || "", 18) : (lote?.bolsa?.color || "");
        const tipoTxt  = stripDesechos(lote?.tipo?.nombre || "");

        await descargarPDFLocal({
          etiquetas,
          porHojaValue,
          areaTxt,
          bolsaTxt,
          tipoTxt,
          nombreArchivo: `QR_${lote.loteId}.pdf`,
        });
        return;
      } catch (e) {
        console.error(e);
      }
    }

    try {
      const res = await api.get(`/qr/lotes/${lote.loteId}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR_${lote.loteId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showAlert(e?.response?.data?.mensaje || "No se pudo descargar el PDF", "danger");
    }
  };

  /* =========================
     Descargar PDF desde historial
     ========================= */
  const descargarPDFDe = async (L) => {
    if (Number(L?.porHoja) === 10) {
      try {
        // Si no tienes /qr/lotes/:id detallado, este bloque se salta al catch
        const { data } = await api.get(`/qr/lotes/${L.id}`);
        const etiquetas = [];
        for (const e of (data?.etiquetas || [])) {
          const payload = JSON.stringify({ t: "HSB_QR", c: e.codigo, a: data.area.id, b: data.bolsa.id });
          const dataUrl = await QRCode.toDataURL(payload, { width: qrSizeFor(10) });
          etiquetas.push({ codigo: e.codigo, dataUrl });
        }
        const areaTxt  = truncate(data?.area?.nombre || L.area?.nombre || "", 18);
        const bolsaTxt = truncate(data?.bolsa?.color || L.bolsa?.color || "", 18);
        const tipoTxt  = stripDesechos(data?.tipo?.nombre || "");
        await descargarPDFLocal({
          etiquetas,
          porHojaValue: 10,
          areaTxt,
          bolsaTxt,
          tipoTxt,
          nombreArchivo: `QR_${L.id}.pdf`,
        });
        return;
      } catch (_) {
        // cae al PDF del backend
      }
    }

    try {
      const res = await api.get(`/qr/lotes/${L.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `QR_${L.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showAlert(e?.response?.data?.mensaje || "No se pudo descargar el PDF", "danger");
    }
  };

  /* =========================
     Modal eliminar
     ========================= */
  const openConfirm = (id) => { setLoteToDelete(id); setConfirmOpen(true); };
  const closeConfirm = () => { setConfirmOpen(false); setLoteToDelete(null); };

  useEffect(() => {
    const onKey = (ev) => ev.key === "Escape" && setConfirmOpen(false);
    if (confirmOpen) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [confirmOpen]);

  const confirmarEliminar = async () => {
    if (!loteToDelete) return;
    try {
      await api.delete(`/qr/lotes/${loteToDelete}`);
      closeConfirm();
      cargarLotes(page);
      showAlert("Lote eliminado.", "success", 2200);
    } catch (e) {
      const msg = e?.response?.data?.mensaje || "No se pudo eliminar el lote";
      if (e?.response?.status === 409 || /etiquet/i.test(msg) || /registrad/i.test(msg)) {
        showAlert(
          msg || "No se puede eliminar: este lote tiene etiquetas ya escaneadas en Registro Diario.",
          "warning",
          5000
        );
      } else {
        showAlert(msg, "danger");
      }
    }
  };

  const handleEliminarClick = (L) => {
    if (!L?.puedeEliminar) {
      showAlert(
        "No se puede eliminar este lote porque tiene etiquetas ya escaneadas en Registro Diario.",
        "warning",
        5000
      );
      return;
    }
    openConfirm(L.id);
  };

  // Compactación por densidad (para el preview)
  const compactLevel = porHoja >= 12 ? 3 : porHoja >= 10 ? 2 : porHoja >= 8 ? 1 : 0;
  const areaTxt  = areaSel?.nombre || "";
  const bolsaTxt = etiquetaBolsa(bolsaSel) || "";
  const tipoTxt  = stripDesechos(tipoSel?.nombre || "");

  const areaShown  = compactLevel ? truncate(areaTxt,  compactLevel === 1 ? 22 : compactLevel === 2 ? 18 : 16) : areaTxt;
  const bolsaShown = compactLevel ? truncate(bolsaTxt, compactLevel === 1 ? 20 : compactLevel === 2 ? 18 : 16) : bolsaTxt;
  const tipoShown  = compactLevel ? truncate(tipoTxt,  18) : tipoTxt; // en 12 no se muestra

  const labels = compactLevel >= 2
    ? { area: "Ár:", bolsa: "Bol:", tipo: "Tip:" }
    : { area: "Área:", bolsa: "Bolsa:", tipo: "Tipo:" };

  return (
    <div className="contenedor-qr">
      <div className="header">
        <h2>🧾 Generador de Códigos QR</h2>
        <div className="tabs">
          <button className={`tab ${tab === "generar" ? "active" : ""}`} onClick={() => setTab("generar")}>Generar</button>
          <button className={`tab ${tab === "historial" ? "active" : ""}`} onClick={() => setTab("historial")}>Historial</button>
        </div>
      </div>

      {tab === "generar" && (
        <>
          <div className="opciones">
            <FancySelect
              options={areas.map(a => ({ value: a.id, label: a.nombre }))}
              value={areaId}
              onChange={(v) => setAreaId(Number(v))}
              placeholder="Área…"
            />

            <FancySelect
              options={tipos.map(t => ({ value: t.id, label: t.nombre }))}
              value={tipoId}
              onChange={(v) => setTipoId(Number(v))}
              placeholder="Tipo de desecho…"
              disabled={!tipos.length}
            />

            <FancySelect
              options={bolsasFiltradas.map(b => ({ value: b.id, label: b.color }))}
              value={bolsaId}
              onChange={(v) => setBolsaId(Number(v))}
              placeholder="Bolsa…"
              disabled={!bolsasFiltradas.length}
            />

            <FancySelect
              options={OPCIONES.map(n => ({ value: n, label: `${n} por hoja` }))}
              value={porHoja}
              onChange={(v) => setPorHoja(Number(v))}
            />

            <button className="btn btn-primary" onClick={generar} disabled={generando || !areaId || !tipoId || !bolsaId}>
              {generando ? "Generando..." : "Generar"}
            </button>

            <button className="btn btn-secondary" onClick={descargarPDFActual} disabled={!lote?.loteId}>
              PDF actual
            </button>
          </div>

          {!!preview.length && (
            <>
              <h3 className="subtitulo">Vista previa</h3>
              <div className={`grid-codigos cantidad-${porHoja}`}>
                {preview.map((p, i) => (
                  <div key={i} className="item-qr">
                    <img src={p.dataUrl} alt={p.codigo} style={{ width: qrPx, height: "auto" }} />

                    {/* Meta compacta y segura */}
                    <div className={`qr-meta ${compactLevel ? "compact" : ""} ${compactLevel >= 2 ? "ultra" : ""}`}>
                      <div className="qr-line">
                        <span className="qr-label">{labels.area}</span>
                        <span className="qr-value">{areaShown}</span>
                      </div>
                      <div className="qr-line">
                        <span className="qr-label">{labels.bolsa}</span>
                        <span className="qr-value">{bolsaShown}</span>
                      </div>
                      {compactLevel < 2 && (
                        <div className="qr-line">
                          <span className="qr-label">{labels.tipo}</span>
                          <span className="qr-value">{tipoShown || "—"}</span>
                        </div>
                      )}
                      <div className="qr-code-line">{p.codigo}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "historial" && (
        <div className="historial">
          <div className="historial-top">
            <div className="filters">
              <FancySelect
                options={[{ value: 0, label: "Todas las áreas" }, ...areas.map(a => ({ value: a.id, label: a.nombre }))]}
                value={filtroAreaId}
                onChange={(v) => setFiltroAreaId(Number(v))}
              />

              <FancySelect
                options={[{ value: 0, label: "Todos los colores" }, ...bolsas.map(b => ({ value: b.id, label: b.color }))]}
                value={filtroBolsaId}
                onChange={(v) => setFiltroBolsaId(Number(v))}
              />
            </div>

            <div className="paginador">
              <button className="btn btn-ghost" onClick={() => irA(page - 1)} disabled={cargandoLotes || page <= 1}>←</button>
              <span className="page-tag">{page} / {totalPages}</span>
              <button className="btn btn-ghost" onClick={() => irA(page + 1)} disabled={cargandoLotes || page >= totalPages}>→</button>
            </div>
          </div>

          <div className="tabla-wrapper">
            <table className="tabla-lotes">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Bolsa</th>
                  <th>Cant.</th>
                  <th>Por hoja</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((L) => (
                  <tr key={L.id}>
                    <td>{L.area?.nombre}</td>
                    <td>{L.bolsa?.color}</td>
                    <td>{L._count?.etiquetas ?? L.cantidad}</td>
                    <td>{L.porHoja}</td>
                    <td className="acciones">
                      <button className="btn btn-primary" onClick={() => descargarPDFDe(L)}>PDF</button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleEliminarClick(L)}
                        title={L.puedeEliminar ? "Eliminar lote" : "No se puede eliminar: hay etiquetas ya escaneadas"}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {!lotes.length && (
                  <tr>
                    <td colSpan={5} className="empty">Sin lotes aún.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal confirmación */}
      {confirmOpen && (
        <div
          className="qr-modal-overlay"
          onClick={(e) => { if (e.target.classList.contains("qr-modal-overlay")) closeConfirm(); }}
        >
          <div className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qrModalTitle">
            <button className="qr-modal-close" onClick={closeConfirm} aria-label="Cerrar">×</button>
            <h3 id="qrModalTitle" className="qr-modal-title">Eliminar lote</h3>
            <p className="qr-modal-text">¿Seguro que deseas eliminar este lote?</p>
            <div className="qr-modal-actions">
              <button className="btn qr-btn-light" onClick={closeConfirm}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmarEliminar}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ALERTA centrada estilo tarjeta */}
      {alerta.open && (
        <div
          className={`qr-alert qr-alert--${alerta.tipo}`}
          role="alert"
          aria-live="assertive"
        >
          <span className="qr-alert-text">{alerta.msg}</span>
          <button
            className="qr-alert-close"
            aria-label="Cerrar alerta"
            onClick={() => setAlerta((a) => ({ ...a, open: false }))}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
