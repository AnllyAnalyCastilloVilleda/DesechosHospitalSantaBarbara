// src/Usuarios.jsx
import React, { useEffect, useState } from "react";
import { http } from "./config/api";
import "./Usuarios.css";

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

/* ============ Modal de confirmación bonito ============ */
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
          <p className="u-paragraph">{message}</p>
        </div>
        <div className="u-modal-actions">
          <button className="u-btn u-btn-light" onClick={onCancel}>{cancelText}</button>
          <button className={`u-btn ${confirmVariant}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* ============ Toast superior (auto-cierre) ============ */
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

/* ============ Util: validación de correo ============ */
function isValidEmail(s = "") {
  return /^[^\s@]+@[^\s@]{1,}\.[^\s@]{2,}$/i.test(String(s).trim());
}

/* ============ Formulario (sin contraseñas) ============ */
function UsuarioForm({ initial = {}, roles = [], onSubmit, loading, excludeId, mode = "create" }) {
  const [f, setF] = useState({
    nombre: "",
    usuario: "",
    correo: "",
    rolId: "",
    ...initial,
  });
  useEffect(() => { setF(s => ({ ...s, ...initial })); }, [initial]);

  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const [checking, setChecking] = useState(false);
  const [dup, setDup] = useState({ usuario: false, correo: false });

  const debUsuario = useDebounced(f.usuario, 400);
  const debCorreo  = useDebounced(f.correo,  400);
  const emailValid = !f.correo || isValidEmail(f.correo);
  const emailInvalid = !!f.correo && !emailValid;

  // Verificar usuario/correo ocupados
  useEffect(() => {
    let cancel = false;
    async function check() {
      const sameUsuario = (initial.usuario || "").toLowerCase() === (f.usuario || "").toLowerCase();
      const sameCorreo  = (initial.correo  || "").toLowerCase() === (f.correo  || "").toLowerCase();

      const wantCheckUsuario = !!debUsuario && !sameUsuario;
      const correoUsable     = !!debCorreo && isValidEmail(debCorreo);
      const wantCheckCorreo  = correoUsable && !sameCorreo;

      if (!wantCheckUsuario && !wantCheckCorreo) {
        setDup({ usuario: false, correo: false });
        setChecking(false);
        return;
      }

      setChecking(true);
      try {
        const params = {};
        if (wantCheckUsuario) params.usuario = debUsuario;
        if (wantCheckCorreo)  params.correo  = debCorreo;
        if (excludeId)        params.excludeId = excludeId;

        const { data } = await http.get("/usuarios/existe", { params });
        if (!cancel) {
          setDup({
            usuario: wantCheckUsuario ? !!data?.usuarioOcupado : false,
            correo:  wantCheckCorreo  ? !!data?.correoOcupado  : false,
          });
        }
      } catch {
        if (!cancel) setDup(d => d);
      } finally {
        if (!cancel) setChecking(false);
      }
    }
    check();
    return () => { cancel = true; };
  }, [debUsuario, debCorreo, excludeId, initial.usuario, initial.correo, f.usuario, f.correo]);

  const valid = f.nombre && f.usuario && f.correo && emailValid && f.rolId && !dup.usuario && !dup.correo;

  return (
    <form
      className="u-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ nombre: f.nombre, usuario: f.usuario, correo: f.correo, rolId: Number(f.rolId) });
      }}
    >
      <label>Nombre completo
        <input className="u-input" value={f.nombre} onChange={e => set("nombre", e.target.value)} />
      </label>

      <label>Nombre de usuario
        <input className="u-input" value={f.usuario} onChange={e => set("usuario", e.target.value)} />
        {f.usuario ? (
          dup.usuario
            ? <div className="hint-bad">Este usuario ya está registrado.</div>
            : <div className="hint-muted">Usuario disponible.</div>
        ) : (
          <div className="hint-muted">Escribe un usuario.</div>
        )}
      </label>

      <label>Correo electrónico
        <input
          type="email"
          className={`u-input ${emailInvalid ? "is-invalid" : ""}`}
          value={f.correo}
          onChange={(e) => set("correo", e.target.value)}
          aria-invalid={emailInvalid}
        />
        {!f.correo ? (
          <div className="hint-muted">Escribe un correo válido.</div>
        ) : !emailValid ? (
          <div className="hint-bad">Formato de correo inválido.</div>
        ) : dup.correo ? (
          <div className="hint-bad">Este correo ya está registrado.</div>
        ) : (
          <div className="hint-muted">Correo disponible.</div>
        )}
      </label>

      <label>Rol
        <select className="u-input" value={f.rolId} onChange={e => set("rolId", e.target.value)}>
          <option value="">Seleccionar…</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </label>

      {mode === "create" && (
        <div className="hint-muted" style={{ marginTop: 6 }}>
          Al crear el usuario se enviará un correo con una contraseña temporal o enlace para establecerla.
        </div>
      )}

      <div className="u-form-actions">
        <button
          type="submit"
          className="u-btn u-btn-primary"
          disabled={!valid || loading || checking}
          title={!valid ? "Revisa los campos obligatorios" : ""}
        >
          {loading ? "Guardando..." : checking ? "Verificando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

/* ============ Página ============ */
export default function Usuarios() {
  const [q, setQ] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [rows, setRows] = useState([]);
  const [roles, setRoles] = useState([]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ text: "", type: "info" });

  const [confirm, setConfirm] = useState({ open: false });

  useEffect(() => { loadRoles(); }, []);
  useEffect(() => { loadUsers(); }, [q, showDeleted]);

  async function loadRoles() {
    try {
      const { data } = await http.get(`/roles?activo=true`);
      setRoles(data || []);
    } catch {
      setRoles([]);
    }
  }

  async function loadUsers() {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("estado", showDeleted ? "eliminados" : "activos");
      const { data } = await http.get(`/usuarios?${params.toString()}`);
      setRows(data || []);
    } catch {
      setRows([]);
    }
  }

  function toastOk(text) { setToast({ text, type: "success" }); }
  function toastErr(text) { setToast({ text, type: "danger" }); }

  async function createUser(f) {
    setBusy(true);
    try {
      // f ya sólo contiene nombre, usuario, correo y rolId
      await http.post(`/usuarios`, f);
      setCreating(false);
      toastOk("Usuario creado y correo enviado.");
      await loadUsers();
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.response?.data?.message || "No se pudo crear.";
      toastErr(msg);
    } finally { setBusy(false); }
  }

  async function updateUser(f) {
    if (!editing) return;
    setBusy(true);
    try {
      await http.put(`/usuarios/${editing.id}`, f);
      setEditing(null);
      toastOk("Cambios guardados.");
      await loadUsers();
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.response?.data?.message || "No se pudo actualizar.";
      toastErr(msg);
    } finally { setBusy(false); }
  }

  function confirmDeactivate(u) {
    setConfirm({
      open: true,
      title: "Desactivar usuario",
      message: `¿Seguro que deseas desactivar a "${u.nombre}"? Podrás restaurarlo luego.`,
      confirmText: "Sí, desactivar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.delete(`/usuarios/${u.id}`);
          toastOk("Usuario desactivado.");
          await loadUsers();
        } catch {
          toastErr("No se pudo desactivar.");
        }
      },
    });
  }

  function confirmDelete(u) {
    setConfirm({
      open: true,
      title: "Eliminar usuario",
      message: `Esto eliminará definitivamente a "${u.nombre}". ¿Deseas continuar?`,
      confirmText: "Sí, eliminar",
      confirmVariant: "u-btn-danger",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.delete(`/usuarios/${u.id}?hard=true`);
          toastOk("Usuario eliminado definitivamente.");
        } catch {
          toastErr("No se pudo eliminar.");
        } finally {
          await loadUsers();
        }
      },
    });
  }

  function confirmRestore(u) {
    setConfirm({
      open: true,
      title: "Restaurar usuario",
      message: `¿Restaurar al usuario "${u.nombre}"?`,
      confirmText: "Sí, restaurar",
      confirmVariant: "u-btn-success",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.post(`/usuarios/${u.id}/restaurar`);
          toastOk("Usuario restaurado.");
          await loadUsers();
        } catch {
          toastErr("No se pudo restaurar.");
        }
      },
    });
  }

  function confirmResend(u) {
    setConfirm({
      open: true,
      title: "Enviar correo",
      message: `¿Enviar una nueva contraseña temporal al correo de "${u.nombre}" (${u.correo})?`,
      confirmText: "Sí, enviar",
      confirmVariant: "u-btn-blue",
      onCancel: () => setConfirm({ open: false }),
      onConfirm: async () => {
        setConfirm({ open: false });
        try {
          await http.post(`/usuarios/${u.id}/reenviar-temporal`);
          toastOk("Contraseña temporal reenviada por correo.");
        } catch {
          toastErr("No se pudo reenviar la temporal.");
        }
      },
    });
  }

  return (
    <div className="u-page">
      <div className="u-card u-head">
        <h2>Gestión de Usuarios</h2>
        <div className="u-head-actions">
          <input
            className="u-input"
            placeholder="Buscar por nombre, usuario o correo…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="u-btn u-btn-primary" onClick={() => setCreating(true)}>
            + Crear nuevo usuario
          </button>
          <button className="u-btn u-btn-light" onClick={() => setShowDeleted(s => !s)}>
            {showDeleted ? "Ver usuarios activos" : "Ver usuarios desactivados"}
          </button>
        </div>
      </div>

      <div className="u-card">
        <table className="u-table">
          <colgroup>
            <col style={{ width: 56 }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: 96 }} />
            <col className="col-actions" style={{ width: 220 }} />
          </colgroup>

          <thead>
            <tr>
              <th>No.</th>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
              <th className="th-actions">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {(rows || []).map((u, i) => (
              <tr key={u.id}>
                <td>{i + 1}</td>
                <td className="u-wrap">{u.nombre}</td>
                <td className="u-wrap">{u.usuario}</td>
                <td className="u-wrap">{u.correo}</td>
                <td className="u-wrap">{u.rol?.nombre || "-"}</td>
                <td>
                  <span className={`u-status ${u.estado ? 'ok' : 'off'}`}>
                    {u.estado ? "Activo" : "Desactivado"}
                  </span>
                </td>
                <td>
                  {u.estado ? (
                    <div className="u-row-actions compact">
                      {/* Editar */}
                      <button
                        className="u-iconbtn u-amber"
                        onClick={() => setEditing(u)}
                        title="Editar usuario"
                        aria-label="Editar usuario"
                        data-tip="Editar"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M16.5 3.5a2.12 2.12 0 113 3L8 18l-4 1 1-4 11.5-11.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Correo */}
                      <button
                        className="u-iconbtn u-blue"
                        onClick={() => confirmResend(u)}
                        title="Enviar correo con contraseña temporal"
                        aria-label="Enviar correo con contraseña temporal"
                        data-tip="Reenviar Contraseña Correo"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 0l8 6 8-6"
                                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Desactivar */}
                      <button
                        className="u-iconbtn u-danger"
                        onClick={() => confirmDeactivate(u)}
                        title="Desactivar usuario"
                        aria-label="Desactivar usuario"
                        data-tip="Desactivar"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/>
                          <path d="M5.6 18.4L18.4 5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="u-row-actions compact">
                      {/* Restaurar */}
                      <button
                        className="u-iconbtn u-success"
                        onClick={() => confirmRestore(u)}
                        title="Restaurar usuario"
                        aria-label="Restaurar usuario"
                        data-tip="Restaurar"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Eliminar definitivo */}
                      <button
                        className="u-iconbtn u-danger"
                        onClick={() => confirmDelete(u)}
                        title="Eliminar definitivamente"
                        aria-label="Eliminar definitivamente"
                        data-tip="Eliminar"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                          <path d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr>
                <td colSpan="7" className="u-empty">Sin resultados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Crear */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Crear usuario">
        <UsuarioForm roles={roles} onSubmit={createUser} loading={busy} mode="create" />
      </Modal>

      {/* Editar */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar usuario">
        {editing && (
          <UsuarioForm
            roles={roles}
            initial={{
              nombre: editing.nombre,
              usuario: editing.usuario,
              correo: editing.correo,
              rolId: editing.rolId,
            }}
            excludeId={editing.id}
            onSubmit={updateUser}
            loading={busy}
            mode="edit"
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
