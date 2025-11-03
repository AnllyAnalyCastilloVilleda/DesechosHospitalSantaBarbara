// src/TiposDesecho.jsx
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import api from "./config/api";
import "./TiposDesecho.css";

function Portal({ children }) {
  return ReactDOM.createPortal(children, document.body);
}

/* --- pequeño hook para debounce --- */
function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/* ========= ConfirmDialog (idéntico al de Áreas) ========= */
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

export default function TiposDesecho() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // UI
  const [showDisabled, setShowDisabled] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [saving, setSaving] = useState(false);

  // ConfirmDialog
  const [confirm, setConfirm] = useState({ open: false });

  // Form
  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Search
  const [q, setQ] = useState("");
  const debQ = useDebounced(q, 350);

  // bloqueo de scroll cuando modal abierto
  useEffect(() => {
    if (modalOpen) document.body.classList.add("no-scroll");
    else document.body.classList.remove("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [modalOpen]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDisabled, debQ]);

  const load = async () => {
    try {
      setLoading(true);
      const params = {
        ...(debQ ? { q: debQ } : {}),
        estado: showDisabled ? "eliminados" : "activos",
      };
      const { data } = await api.get("/tipos-desecho", { params });
      setRows(data || []);
    } catch (e) {
      console.error(e);
      alert("Error al cargar tipos de desecho");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setNombre("");
    setDescripcion("");
  };

  const openCreate = () => {
    resetForm();
    setModalMode("create");
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setNombre(r.nombre || "");
    setDescripcion(r.descripcion || "");
    setModalMode("edit");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const guardar = async (e) => {
    e?.preventDefault?.();
    if (!nombre.trim()) return alert("El nombre es obligatorio");

    try {
      setSaving(true);
      const payload = { nombre, descripcion };
      if (modalMode === "edit" && editId) {
        await api.put(`/tipos-desecho/${editId}`, payload);
      } else {
        await api.post("/tipos-desecho", payload);
      }
      closeModal();
      resetForm();
      await load();
    } catch (e) {
      if (e?.response?.status === 409) {
        alert(e.response.data?.mensaje || "Ya existe un tipo con ese nombre.");
      } else {
        console.error(e);
        alert("Error al guardar");
      }
    } finally {
      setSaving(false);
    }
  };

  /* ===== Confirmaciones ===== */
  const pedirConfirmDeshabilitar = (r) => {
    setConfirm({
      open: true,
      title: "Deshabilitar tipo",
      message: `¿Seguro que deseas deshabilitar el tipo "${r.nombre}"?`,
      confirmText: "Sí, deshabilitar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await api.patch(`/tipos-desecho/${r.id}/disable`);
          await load();
        } catch (e) {
          console.error(e);
          alert("Error al deshabilitar");
        }
      },
    });
  };

  const pedirConfirmHabilitar = (r) => {
    setConfirm({
      open: true,
      title: "Habilitar tipo",
      message: `¿Habilitar el tipo "${r.nombre}"?`,
      confirmText: "Sí, habilitar",
      confirmVariant: "u-btn-success",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await api.patch(`/tipos-desecho/${r.id}/enable`);
          await load();
        } catch (e) {
          console.error(e);
          alert("Error al habilitar");
        }
      },
    });
  };

  const pedirConfirmEliminar = (r) => {
    setConfirm({
      open: true,
      title: "Eliminar tipo",
      message: `Esto eliminará definitivamente "${r.nombre}". ¿Deseas continuar? (Debe estar deshabilitado)`,
      confirmText: "Sí, eliminar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await api.delete(`/tipos-desecho/${r.id}`, { params: { hard: true } });
          await load();
        } catch (e) {
          console.error(e);
          alert("Error al eliminar");
        }
      },
    });
  };

  return (
    <div className="td-wrapper">
      {/* Header-card */}
      <div className="td-header-card">
        <div className="td-row1">
          <input
            className="td-search"
            placeholder={`Buscar tipos ${showDisabled ? "deshabilitados" : "activos"}...`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar tipo de desecho"
          />
          <button
            type="button"
            className="td-btn td-btn-primary td-btn-sm"
            onClick={openCreate}
          >
            + Crear tipo
          </button>
        </div>
        <div className="td-row2">
          <button
            type="button"
            className="td-btn td-btn-outline td-btn-sm"
            onClick={() => setShowDisabled((s) => !s)}
          >
            {showDisabled ? "Ver tipos activos" : "Ver tipos deshabilitados"}
          </button>
        </div>
      </div>

      <h2 className="td-title">Tipos de Desecho</h2>

      {/* Tabla */}
      <div className="td-table-card">
        <table className="td-table">
          <colgroup>
            <col className="c-no" />
            <col className="c-nombre" />
            <col className="c-desc" />
            <col className="c-estado" />
            <col className="c-acciones" />
          </colgroup>
          <thead>
            <tr>
              <th>No.</th>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{ textAlign: "center", padding: 16 }}>Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: "center", padding: 16 }}>Sin datos</td></tr>
            ) : (
              rows.map((r, i) => {
                const isActiva =
                  typeof r.estado !== "undefined"
                    ? !!r.estado
                    : typeof r.activo !== "undefined"
                    ? !!r.activo
                    : !showDisabled;

                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>{r.nombre}</td>
                    <td className="desc">{r.descripcion || "—"}</td>
                    <td>
                      <span className={`u-status ${isActiva ? "ok" : "off"}`}>
                        {isActiva ? "Activo" : "Deshabilitado"}
                      </span>
                    </td>
                    <td>
                      <div className="td-acciones">
                        {!showDisabled ? (
                          <>
                            <button className="td-edit" onClick={() => openEdit(r)}>Editar</button>
                            <button className="td-danger" onClick={() => pedirConfirmDeshabilitar(r)}>Deshabilitar</button>
                          </>
                        ) : (
                          <>
                            <button className="td-edit" onClick={() => pedirConfirmHabilitar(r)}>Habilitar</button>
                            <button className="td-danger" onClick={() => pedirConfirmEliminar(r)}>Eliminar</button>
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
          <div className="td-modal-backdrop" onClick={closeModal}>
            <div className="td-modal" onClick={(e) => e.stopPropagation()}>
              <div className="td-modal-header">
                <h3>{modalMode === "edit" ? "Editar tipo de desecho" : "Crear tipo de desecho"}</h3>
                <button className="td-modal-close" onClick={closeModal} aria-label="Cerrar">✕</button>
              </div>

              <form className="td-modal-body" onSubmit={guardar}>
                <div className="td-field">
                  <label>Nombre</label>
                  <input
                    placeholder="Ej. Infeccioso"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                  <small>Nombre único, no distingue mayúsculas/minúsculas.</small>
                </div>

                <div className="td-field">
                  <label>Descripción</label>
                  <textarea
                    rows={4}
                    placeholder="Breve descripción del tipo"
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>

                <div className="td-modal-footer">
                  <button type="button" className="td-btn td-btn-sm" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="td-btn td-btn-primary td-btn-sm"
                    disabled={saving || !nombre.trim()}
                  >
                    {modalMode === "edit" ? (saving ? "Guardando..." : "Guardar cambios") : (saving ? "Creando..." : "Guardar")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Portal>
      )}

      {/* Confirmaciones */}
      {confirm.open && (
        <Portal>
          <ConfirmDialog {...confirm} />
        </Portal>
      )}
    </div>
  );
}
