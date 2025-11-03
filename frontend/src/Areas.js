// src/Areas.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { http } from "./config/api";
import "./Areas.css";

/* ============ Modal genérico ============ */
function Modal({ open, title, children, onClose, maxWidth = 560 }) {
  if (!open) return null;
  return (
    <div className="u-modal-overlay" role="dialog" aria-modal="true">
      <div className="u-modal-card" style={{ maxWidth }}>
        <div className="u-modal-head">
          <h3>{title}</h3>
          <button className="u-btn u-btn-light" onClick={onClose}>✕</button>
        </div>
        <div className="u-modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ============ Modal confirmación bonito ============ */
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

/* ============ Toast superior ============ */
function TopToast({ text, type = "info", onClose, autoClose = 4000 }) {
  useEffect(() => {
    if (!text) return;
    const id = setTimeout(() => onClose?.(), autoClose);
    return () => clearTimeout(id);
  }, [text, autoClose, onClose]);

  if (!text) return null;
  return (
    <div className={`u-top-toast ${type}`} role="status" aria-live="polite">
      <span className="u-top-toast__text">{text}</span>
      <button className="u-top-toast__close" onClick={onClose} title="Cerrar">✕</button>
    </div>
  );
}

/* ============ Hook: debounce ============ */
function useDebounced(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/* ============ Formulario ============ */
function AreaForm({
  initial = {},
  onSubmit,              // (payload, selectedTipoIds) => void
  loading,
  excludeId,
  tipos = [],            // [{id,nombre,slug}]
  selectedTipoIds = [],  // [number]
  onChangeTipos,         // (ids) => void
}) {
  const [f, setF] = useState({ nombre: "", descripcion: "", ...initial });
  useEffect(() => { setF(s => ({ ...s, ...initial })); }, [initial]);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  // Validación en vivo de nombre único
  const [checking, setChecking] = useState(false);
  const [nombreOcupado, setNombreOcupado] = useState(false);
  const debNombre = useDebounced(f.nombre, 400);

  useEffect(() => {
    let cancel = false;
    async function check() {
      const same = (initial.nombre || "").toLowerCase() === (f.nombre || "").toLowerCase();
      if (!debNombre) { setNombreOcupado(false); setChecking(false); return; }
      if (same) { setNombreOcupado(false); setChecking(false); return; }
      setChecking(true);
      try {
        const params = { nombre: debNombre };
        if (excludeId) params.excludeId = excludeId;
        const { data } = await http.get("/areas/existe", { params });
        if (!cancel) setNombreOcupado(!same && !!data?.nombreOcupado);
      } catch { if (!cancel) setNombreOcupado(false); }
      finally { if (!cancel) setChecking(false); }
    }
    check();
    return () => { cancel = true; };
  }, [debNombre, excludeId, initial.nombre, f.nombre]);

  const valid = (f.nombre || "").trim() && !nombreOcupado;

  const hintOk    = { fontSize: 12, color: "#166534", marginTop: 4 };
  const hintBad   = { fontSize: 12, color: "#b91c1c", marginTop: 4 };
  const hintMuted = { fontSize: 12, color: "#64748b", marginTop: 4 };

  // Manejador de checkboxes de tipos
  function toggleTipo(id) {
    const has = selectedTipoIds.includes(id);
    const next = has ? selectedTipoIds.filter(x => x !== id) : [...selectedTipoIds, id];
    onChangeTipos?.(next);
  }

  return (
    <form
      className="u-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(
          { nombre: f.nombre?.trim(), descripcion: (f.descripcion || "").trim() },
          selectedTipoIds
        );
      }}
    >
      <label>Nombre del área
        <input
          value={f.nombre}
          onChange={(e) => set("nombre", e.target.value)}
          placeholder="Ej. Emergencias"
        />
        {f.nombre ? (
          nombreOcupado ? <div style={hintBad}>Este nombre ya está registrado.</div>
                        : <div style={hintOk}>Nombre disponible.</div>
        ) : (
          <div style={hintMuted}>Escribe un nombre único.</div>
        )}
      </label>

      <label>Descripción
        <textarea
          rows={3}
          value={f.descripcion}
          onChange={(e) => set("descripcion", e.target.value)}
          placeholder="Breve descripción del área"
        />
      </label>

      {/* === NUEVO: selección de tipos permitidos === */}
      <fieldset className="u-fieldset">
        <legend>Tipos de desechos permitidos</legend>
        {tipos.length === 0 ? (
          <div style={{ fontSize: 13, color: "#64748b" }}>
            No hay tipos activos. Crea algunos en <b>Tipos de Desecho</b>.
          </div>
        ) : (
          <div className="u-chip-grid">
            {tipos.map(t => (
              <label key={t.id} className={`u-chip ${selectedTipoIds.includes(t.id) ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={selectedTipoIds.includes(t.id)}
                  onChange={() => toggleTipo(t.id)}
                />
                <span className="u-chip-text">{t.nombre}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="u-form-actions">
        <button
          type="submit"
          className="u-btn u-btn-primary"
          disabled={!valid || loading || checking}
          title={!valid ? "Revisa el nombre" : ""}
        >
          {loading ? "Guardando..." : checking ? "Verificando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

/* ============ Página Áreas ============ */
export default function Areas() {
  const [q, setQ] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [rows, setRows] = useState([]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ text: "", type: "info" });
  const [confirm, setConfirm] = useState({ open: false });

  // Tipos activos para pintar checkboxes
  const [tipos, setTipos] = useState([]);
  // Selección en el formulario (crear/editar)
  const [formTipoIds, setFormTipoIds] = useState([]);

  // ---- funciones ESTABLES ----
  const loadAreas = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("estado", showDeleted ? "eliminados" : "activos");
      const { data } = await http.get(`/areas?${params.toString()}`);
      setRows(data || []);
    } catch {
      setRows([]);
    }
  }, [q, showDeleted]);

  const loadTipos = useCallback(async () => {
    try {
      // Preferimos activos; si no existe ese filtro en tu API, quita "params"
      const { data } = await http.get("/tipos-desecho", { params: { estado: "activos" } });
      const list = Array.isArray(data) ? data : (data?.rows || []);
      setTipos(list.map(t => ({ id: t.id, nombre: t.nombre, slug: t.slug })));
    } catch {
      setTipos([]);
    }
  }, []);

  const loadTiposDeArea = useCallback(async (areaId) => {
    try {
      const { data } = await http.get(`/areas/${areaId}/tipos`);
      const ids = (data?.tipos || []).map(t => t.id);
      setFormTipoIds(ids);
    } catch {
      setFormTipoIds([]);
    }
  }, []);

  // effects con dependencias correctas
  useEffect(() => { loadAreas(); }, [loadAreas]);
  useEffect(() => { loadTipos(); }, [loadTipos]); // una vez

  function toastOk(text) { setToast({ text, type: "success" }); }
  function toastErr(text) { setToast({ text, type: "danger" }); }

  // Crear
  async function createArea(payload, selectedTipoIds) {
    setBusy(true);
    try {
      const { data: area } = await http.post(`/areas`, payload);
      // Guardar M↔N
      try {
        await http.put(`/areas/${area.id}/tipos`, { tipoIds: selectedTipoIds || [] });
      } catch {
        // Si falla la asignación, igual dejamos creada el área
      }
      setCreating(false);
      toastOk("Área creada.");
      await loadAreas();
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.response?.data?.message || "No se pudo crear el área.";
      toastErr(msg);
    } finally { setBusy(false); }
  }

  // Editar
  async function updateArea(payload, selectedTipoIds) {
    if (!editing) return;
    setBusy(true);
    try {
      await http.put(`/areas/${editing.id}`, payload);
      // Actualizar M↔N
      await http.put(`/areas/${editing.id}/tipos`, { tipoIds: selectedTipoIds || [] });
      setEditing(null);
      toastOk("Cambios guardados.");
      await loadAreas();
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.response?.data?.message || "No se pudo actualizar el área.";
      toastErr(msg);
    } finally { setBusy(false); }
  }

  // Deshabilitar
  function confirmDisable(a) {
    setConfirm({
      open: true,
      title: "Deshabilitar área",
      message: `¿Seguro que deseas deshabilitar el área "${a.nombre}"?`,
      confirmText: "Sí, deshabilitar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.patch(`/areas/${a.id}/disable`);
          toastOk("Área deshabilitada.");
          await loadAreas();
        } catch {
          toastErr("No se pudo deshabilitar.");
        }
      },
    });
  }

  // Habilitar
  function confirmEnable(a) {
    setConfirm({
      open: true,
      title: "Habilitar área",
      message: `¿Habilitar el área "${a.nombre}"?`,
      confirmText: "Sí, habilitar",
      confirmVariant: "u-btn-success",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.patch(`/areas/${a.id}/enable`);
          toastOk("Área habilitada.");
          await loadAreas();
        } catch {
          toastErr("No se pudo habilitar.");
        }
      },
    });
  }

  // Eliminar (definitivo)
  function confirmDelete(a) {
    setConfirm({
      open: true,
      title: "Eliminar área",
      message: `Esto eliminará definitivamente el área "${a.nombre}". ¿Deseas continuar? (Debe estar deshabilitada)`,
      confirmText: "Sí, eliminar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.delete(`/areas/${a.id}?hard=true`);
          toastOk("Área eliminada definitivamente.");
          await loadAreas();
        } catch (e) {
          const msg = e?.response?.data?.mensaje || "No se pudo eliminar.";
          toastErr(msg);
        }
      },
    });
  }

  const createdBy = (a) => a?.creadoPor?.nombre || a?.creadoPor?.usuario || "-";

  const placeholder = useMemo(
    () => (showDeleted ? "Buscar áreas deshabilitadas…" : "Buscar áreas activas…"),
    [showDeleted]
  );

  return (
    <div className="u-page">
      <div className="u-card u-head">
        <h2>Gestión de Áreas</h2>
        <div className="u-head-actions">
          <input
            className="u-input"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="u-btn u-btn-primary"
            onClick={() => { setCreating(true); setFormTipoIds([]); }}
          >
            + Crear área
          </button>
          <button className="u-btn u-btn-light" onClick={() => setShowDeleted(s => !s)}>
            {showDeleted ? "Ver áreas activas" : "Ver áreas deshabilitadas"}
          </button>
        </div>
      </div>

      <div className="u-card">
        <table className="u-table table-areas">
          <colgroup>
            <col className="c-no" />
            <col className="c-area" />
            <col className="c-desc" />
            <col className="c-creado" />
            <col className="c-estado" />
            <col className="c-acciones" />
          </colgroup>

          <thead>
            <tr>
              <th>No.</th>
              <th>Área</th>
              <th>Descripción</th>
              <th>Creado por</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((a, i) => (
              <tr key={a.id}>
                <td>{i + 1}</td>
                <td>{a.nombre}</td>
                <td>{a.descripcion || "-"}</td>
                <td>{createdBy(a)}</td>
                <td>
                  <span className={`u-status ${a.estado ? "ok" : "off"}`}>
                    {a.estado ? "Activa" : "Deshabilitada"}
                  </span>
                </td>
                <td>
                  <div className="u-actions">
                    {a.estado ? (
                      <>
                        <button
                          className="u-btn u-btn-yellow u-btn--xs"
                          onClick={async () => {
                            setEditing(a);
                            await loadTiposDeArea(a.id);
                          }}
                        >
                          Editar
                        </button>
                        <button className="u-btn u-btn-danger u-btn--xs" onClick={() => confirmDisable(a)}>
                          Deshabilitar
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="u-btn u-btn-success u-btn--xs" onClick={() => confirmEnable(a)}>
                          Habilitar
                        </button>
                        <button className="u-btn u-btn-danger u-btn--xs" onClick={() => confirmDelete(a)}>
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", padding: 18 }}>
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Crear */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Crear área">
        <AreaForm
          onSubmit={createArea}
          loading={busy}
          tipos={tipos}
          selectedTipoIds={formTipoIds}
          onChangeTipos={setFormTipoIds}
        />
      </Modal>

      {/* Editar */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar área">
        {editing && (
          <AreaForm
            initial={{ nombre: editing.nombre, descripcion: editing.descripcion || "" }}
            excludeId={editing.id}
            onSubmit={updateArea}
            loading={busy}
            tipos={tipos}
            selectedTipoIds={formTipoIds}
            onChangeTipos={setFormTipoIds}
          />
        )}
      </Modal>

      <ConfirmDialog {...confirm} />
      <TopToast
        text={toast.text}
        type={toast.type}
        onClose={() => setToast({ text: "", type: "info" })}
      />
    </div>
  );
}
