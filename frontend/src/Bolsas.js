// src/Bolsas.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { http as api } from "./config/api";
import "./Bolsas.css";

/* ========= Portal para tu modal de crear/editar ========= */
function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

/* ========= ConfirmDialog (igual estilo que Áreas) ========= */
function ConfirmDialog({
  open,
  title = "¿Seguro?",
  message,
  confirmText = "Confirmar",
  confirmVariant = "u-btn-primary",
  cancelText = "Cancelar",
  onCancel,
  onConfirm,
}) {
  if (!open) return null;
  return (
    <div className="u-modal-overlay" role="dialog" aria-modal="true">
      <div className="u-modal-card" style={{ maxWidth: 520 }}>
        <div className="u-modal-head">
          <h3>{title}</h3>
          <button className="u-btn u-btn-light" onClick={onCancel}>✕</button>
        </div>
        <div className="u-modal-body">
          <p style={{ margin: 0, lineHeight: 1.5 }}>{message}</p>
        </div>
        <div className="u-modal-actions">
          <button className="u-btn u-btn-light" onClick={onCancel}>{cancelText}</button>
          <button className={`u-btn ${confirmVariant}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export default function Bolsas() {
  // Tabla
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // Catálogo Tipos
  const [tipos, setTipos] = useState([]);
  const tiposMap = useMemo(() => {
    const m = new Map();
    for (const t of tipos) m.set(Number(t.id), t);
    return m;
  }, [tipos]);

  // UI
  const [showDisabled, setShowDisabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ open: false });

  // Form
  const [editId, setEditId] = useState(null);
  const [color, setColor] = useState("");
  const [tamano, setTamano] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipoDesechoId, setTipoDesechoId] = useState("");

  // Search
  const [q, setQ] = useState("");

  /* -------- Cargas ESTABLES -------- */
  const loadTipos = useCallback(async () => {
    try {
      const { data } = await api.get("/tipos-desecho", { params: { estado: "activos" } });
      setTipos(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setTipos([]);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        ...(q ? { q } : {}),
        activos: showDisabled ? false : true, // backend acepta true/false
      };
      const { data } = await api.get("/bolsas", { params });
      setRows(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      console.error(e);
      alert("Error al cargar bolsas");
    } finally {
      setLoading(false);
    }
  }, [q, showDisabled]);

  // Cargar tipos una vez (función estable)
  useEffect(() => { loadTipos(); }, [loadTipos]);

  // Auto-actualización con debounce correcto y dependencias completas
  useEffect(() => {
    const handle = setTimeout(() => { load(); }, 400);
    return () => clearTimeout(handle);
  }, [q, showDisabled, load]);

  function resetForm() {
    setEditId(null);
    setColor("");
    setTamano("");
    setDescripcion("");
    setTipoDesechoId(tipos.length ? Number(tipos[0].id) : "");
  }

  function openCreate() { resetForm(); setModalMode("create"); setModalOpen(true); }

  function openEdit(r) {
    setEditId(r.id);
    setColor(r.color || "");
    setTamano(r.tamano || "");
    setDescripcion(r.descripcion || "");
    const tId =
      r.tipoDesechoId != null ? Number(r.tipoDesechoId)
      : r.tipoDesecho?.id != null ? Number(r.tipoDesecho.id)
      : "";
    setTipoDesechoId(tId);
    setModalMode("edit");
    setModalOpen(true);
  }

  function closeModal() { if (!saving) setModalOpen(false); }

  async function guardar(e) {
    e?.preventDefault?.();
    if (!color.trim() || !tamano.trim()) return alert("Color y tamaño son obligatorios");
    if (!tipoDesechoId) return alert("Selecciona un tipo de desecho");

    try {
      setSaving(true);
      const payload = {
        color: color.trim(),
        tamano: tamano.trim(),
        descripcion: descripcion?.trim() || null,
        tipoDesechoId: Number(tipoDesechoId),
      };
      if (modalMode === "edit" && editId) {
        await api.patch(`/bolsas/${editId}`, payload);
      } else {
        await api.post("/bolsas", payload);
      }
      closeModal();
      resetForm();
      await load();
    } catch (e) {
      if (e?.response?.status === 409) {
        alert(e.response.data?.mensaje || "Duplicado (color + tamaño).");
      } else {
        console.error(e);
        alert("Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  }

  /* ====== Confirmaciones ====== */
  function pedirConfirmDeshabilitar(r) {
    setConfirm({
      open: true,
      title: "Deshabilitar bolsa",
      message: `¿Seguro que deseas deshabilitar la bolsa "${r.color} - ${r.tamano}"?`,
      confirmText: "Sí, deshabilitar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try { await api.patch(`/bolsas/${r.id}/disable`); await load(); }
        catch (e) { console.error(e); alert("Error al deshabilitar"); }
      },
    });
  }

  function pedirConfirmHabilitar(r) {
    setConfirm({
      open: true,
      title: "Habilitar bolsa",
      message: `¿Habilitar la bolsa "${r.color} - ${r.tamano}"?`,
      confirmText: "Sí, habilitar",
      confirmVariant: "u-btn-success",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try { await api.patch(`/bolsas/${r.id}/enable`); await load(); }
        catch (e) { console.error(e); alert("Error al habilitar"); }
      },
    });
  }

  function pedirConfirmEliminar(r) {
    setConfirm({
      open: true,
      title: "Eliminar bolsa",
      message: `Esto eliminará definitivamente "${r.color} - ${r.tamano}". ¿Deseas continuar? (Debe estar deshabilitada)`,
      confirmText: "Sí, eliminar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try { await api.delete(`/bolsas/${r.id}`, { params: { hard: true } }); await load(); }
        catch (e) { console.error(e); alert("Error al eliminar"); }
      },
    });
  }

  const placeholder = `Buscar bolsas ${showDisabled ? "deshabilitadas" : "activas"}…`;

  return (
    <div className="bolsas-wrapper">
      {/* Header-card */}
      <div className="bls-header-card">
        <div className="bls-row1">
          <input
            className="bls-search"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar bolsas"
          />
          <button
            type="button"
            className="bolsa-btn bolsa-btn-primary bolsa-btn-sm"
            onClick={openCreate}
          >
            + Crear bolsa
          </button>
        </div>
        <div className="bls-row2">
          <button
            type="button"
            className="bolsa-btn bolsa-btn-outline bolsa-btn-sm"
            onClick={() => setShowDisabled((s) => !s)}
          >
            {showDisabled ? "Ver bolsas activas" : "Ver bolsas deshabilitadas"}
          </button>
          {/* Botón "Actualizar" eliminado: ahora la carga es automática */}
        </div>
      </div>

      <h2 className="bls-title">Gestión de Bolsas</h2>

      {/* Tabla */}
      <div className="bls-table-card">
        <table className="bolsas-table">
          <colgroup>
            <col className="c-no" />
            <col className="c-color" />
            <col className="c-tamano" />
            <col className="c-tipo" />
            <col className="c-desc" />
            <col className="c-estado" />
            <col className="c-acciones" />
          </colgroup>
          <thead>
            <tr>
              <th>No.</th>
              <th>Color</th>
              <th>Tamaño</th>
              <th>Tipo de desecho</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: "center", padding: 16 }}>Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: "center", padding: 16 }}>Sin datos</td></tr>
            ) : (
              rows.map((r, i) => {
                const tName =
                  r.tipoDesecho?.nombre ||
                  tiposMap.get(Number(r.tipoDesechoId))?.nombre ||
                  "—";

                const isActiva = (typeof r.estado !== "undefined") ? !!r.estado
                               : (typeof r.activo !== "undefined") ? !!r.activo
                               : true;

                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>{r.color}</td>
                    <td>{r.tamano}</td>
                    <td>{tName}</td>
                    <td className="desc">{r.descripcion || "—"}</td>
                    <td>
                      <span className={`u-status ${isActiva ? "ok" : "off"}`}>
                        {isActiva ? "Activa" : "Deshabilitada"}
                      </span>
                    </td>
                    <td className="acciones-cell">
                      <div className="acciones">
                        {isActiva && !showDisabled ? (
                          <>
                            <button className="editar" onClick={() => openEdit(r)}>Editar</button>
                            <button className="eliminar" onClick={() => pedirConfirmDeshabilitar(r)}>Deshabilitar</button>
                          </>
                        ) : (
                          <>
                            <button className="editar" onClick={() => pedirConfirmHabilitar(r)}>Habilitar</button>
                            <button className="eliminar" onClick={() => pedirConfirmEliminar(r)}>Eliminar</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal crear/editar */}
      {modalOpen && (
        <Portal>
          <div className="bls-modal-backdrop" onClick={closeModal}>
            <div className="bls-modal" onClick={(e) => e.stopPropagation()}>
              <div className="bls-modal-header">
                <h3>{modalMode === "edit" ? "Editar bolsa" : "Crear bolsa"}</h3>
                <button className="bls-modal-close" onClick={closeModal} aria-label="Cerrar">✕</button>
              </div>

              <form className="bls-modal-body" onSubmit={guardar}>
                <div className="field">
                  <label>Color</label>
                  <input placeholder="Ej. Rojo" value={color} onChange={(e) => setColor(e.target.value)} />
                  <small>Escribe un color.</small>
                </div>

                <div className="field">
                  <label>Tamaño</label>
                  <input placeholder="Ej. 30x50" value={tamano} onChange={(e) => setTamano(e.target.value)} />
                  <small>Define un tamaño claro.</small>
                </div>

                <div className="field">
                  <label>Tipo de desecho</label>
                  <select value={tipoDesechoId} onChange={(e) => setTipoDesechoId(Number(e.target.value))}>
                    {tipos.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
                    {!tipos.length && (<option value="">— Sin tipos disponibles —</option>)}
                  </select>
                  <small>Requerido para generar QR y registrar correctamente.</small>
                </div>

                <div className="field">
                  <label>Descripción</label>
                  <textarea
                    rows={4}
                    placeholder="Breve descripción de la bolsa"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>

                <div className="bls-modal-footer">
                  <button type="button" className="bolsa-btn bolsa-btn-sm" onClick={closeModal}>Cancelar</button>
                  <button
                    type="submit"
                    className="bolsa-btn bolsa-btn-primary bolsa-btn-sm"
                    disabled={saving || !color.trim() || !tamano.trim() || !tipoDesechoId}
                  >
                    {modalMode === "edit"
                      ? (saving ? "Guardando..." : "Guardar cambios")
                      : (saving ? "Creando..." : "Guardar")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {/* Confirmaciones */}
      <ConfirmDialog {...confirm} />
    </div>
  );
}
