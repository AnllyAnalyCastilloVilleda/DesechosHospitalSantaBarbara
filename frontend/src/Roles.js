// src/Roles.js
import React, { useEffect, useMemo, useState } from "react";
import api from "./config/api"; // ⬅️ usa tu cliente axios con token
import "./Roles.css";

/* ================= Modal compacto y bonito (frontend) ================= */
function Modal({
  open,
  title = "Confirmar",
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger", // "danger" | "primary" | "success"
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const confirmBtnClass =
    variant === "danger" ? "btn btn-danger" :
    variant === "success" ? "btn btn-success" :
    "btn btn-primary";

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card" aria-live="polite">
        <div className="modal-header">
          <div className={`modal-icon ${variant}`}>!</div>
          <h3 className="modal-title">{title}</h3>
        </div>

        {description && <p className="modal-desc">{description}</p>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
          <button className={confirmBtnClass} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
/* ===================================================================== */

/* ==== Top Toast (banner superior) ==== */
function TopToast({ text, type = "info", onClose }) {
  if (!text) return null;
  const bg = type === "success" ? "#16a34a" : type === "danger" ? "#dc2626" : "#334155";
  return (
    <div
      className="u-top-toast"
      style={{ background: bg }}
      onClick={onClose}
      title="Cerrar"
    >
      <span className="u-top-toast__text">{text}</span>
      <button className="u-top-toast__close" onClick={onClose}>✕</button>
    </div>
  );
}

/* === Iconitos (SVG) pequeñitos y nítidos === */
const IconPencil = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="currentColor"/>
    <path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
  </svg>
);
const IconBan = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
    <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2"/>
  </svg>
);
const IconCheck = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconX = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* Botoncito cuadrado compacto */
const BtnIcon = ({
  title,
  color = "primary",
  variant = "outline",
  onClick,
  children,
  size = 28,
  style,
}) => {
  const palettes = {
    primary: { border: "#4169ff", fg: "#4169ff", solidFg: "#4169ff" },
    danger:  { border: "#e74c3c", fg: "#e74c3c", solidFg: "#e03131" },
    success: { border: "#2ecc71", fg: "#2ecc71", solidFg: "#2ecc71" },
    mute:    { border: "#ced4da", fg: "#6c757d", solidFg: "#6c757d" },
  };
  const p = palettes[color] || palettes.primary;

  const base = {
    width: size,
    height: size,
    padding: 0,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform .06s ease, box-shadow .12s ease, background-color .12s ease",
    background: "transparent",
    color: p.fg,
    border: `1px solid ${p.border}`,
    ...style,
  };

  if (variant === "solid") {
    base.background = "#fff";
    base.color = p.solidFg;
    base.border = "1px solid transparent";
    base.boxShadow = "0 6px 16px rgba(0,0,0,.12)";
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={base}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.95)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseEnter={(e) => { if (variant === "solid") e.currentTarget.style.backgroundColor = "#f9fbff"; }}
      onMouseLeave={(e) => { if (variant === "solid") e.currentTarget.style.backgroundColor = "#fff"; }}
    >
      {children}
    </button>
  );
};

export default function Roles({ usuario, onUsuarioPermisosChange }) {
  const [rolesActivos, setRolesActivos] = useState([]);
  const [rolesOff, setRolesOff] = useState([]);
  const [rolSeleccionado, setRolSeleccionado] = useState(null);
  const [buscador, setBuscador] = useState("");
  const [permisos, setPermisos] = useState([]);
  const [permisosAsignados, setPermisosAsignados] = useState({});
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // confirmaciones
  const [confirm, setConfirm] = useState(null);

  // toast superior
  const [toast, setToast] = useState({ text: "", type: "info" });
  useEffect(() => {
    if (!toast.text) return;
    const t = setTimeout(() => setToast({ text: "", type: "info" }), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // subvista interna: "activos" | "deshabilitados"
  const [vista, setVista] = useState("activos");

  // Edición en línea
  const [editing, setEditing] = useState({ id: null, value: "" });

  // Crear nuevo rol
  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nuevoRol, setNuevoRol] = useState("");

  const esSuperadmin = rolSeleccionado?.nombre === "Superadmin";
  const esAdmin = rolSeleccionado?.nombre === "Administrador";
  const PERMISOS_BLOQUEADOS_ADMIN = new Set(["USUARIOS", "ROLES"]);
  const ROLES_BLOQUEADOS = new Set(["Superadmin", "Administrador", "Recolector", "Estadístico"]);

  // Predeterminados (Recolector con 5 permisos)
  const PERMISOS_PREDETERMINADOS = {
    Administrador: () => (permisos || []).map((p) => p.nombre),
    Estadístico: () => (permisos || []).filter((p) => ["ESTADISTICAS"].includes(p.nombre)).map((p) => p.nombre),
    Recolector:   () =>
      (permisos || [])
        .filter((p) =>
          ["AREAS", "BOLSAS", "TIPOS_DESECHO", "REGISTRO_DIARIO", "CODIGOS_QR"].includes(p.nombre)
        )
        .map((p) => p.nombre),
  };

  // ---------- Cargar data ----------
  const cargar = async () => {
    setCargando(true);
    try {
      const [rolesFullRes, permsRes] = await Promise.all([
        api.get("/roles/full"),
        api.get("/permisos"),
      ]);

      // Normaliza roles: asignados desde _count.usuarios si llega
      const rolesFull = Array.isArray(rolesFullRes.data) ? rolesFullRes.data : [];
      const rolesArr = rolesFull.map((r) => ({
        ...r,
        asignados: r.asignados ?? r._count?.usuarios ?? 0,
      }));

      // Filtra BALANZA y ordena con ESTADISTICAS al final
      const permsArr = Array.isArray(permsRes.data) ? permsRes.data : [];
      const order = [
        "USUARIOS",
        "ROLES",
        "AREAS",
        "BOLSAS",
        "TIPOS_DESECHO",
        "REGISTRO_DIARIO",
        "CODIGOS_QR",
        "ESTADISTICAS", // al final
      ];
      const filteredOrdered = permsArr
        .filter((p) => p?.nombre !== "BALANZA")
        .sort((a, b) => {
          const ia = order.indexOf(a.nombre);
          const ib = order.indexOf(b.nombre);
          const va = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
          const vb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
          return va - vb || a.nombre.localeCompare(b.nombre);
        });

      setRolesActivos(rolesArr.filter((r) => r.activo));
      setRolesOff(rolesArr.filter((r) => !r.activo));
      setPermisos(filteredOrdered);

      // mapa de permisos por rol (array de nombres)
      const mapa = {};
      rolesArr.forEach((r) => { mapa[r.id] = Array.isArray(r.permisos) ? r.permisos : []; });
      setPermisosAsignados(mapa);

      const firstActive = rolesArr.find((r) => r.activo);
      setRolSeleccionado((prev) => prev ?? firstActive ?? null);
    } catch (e) {
      console.error("Error cargando roles/permisos:", e);
      setToast({ text: "Error cargando datos de roles (verifica token).", type: "danger" });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!rolSeleccionado) return;
    // Si el rol no tiene permisos aún, aplicar predeterminados (si aplica)
    const actual = permisosAsignados[rolSeleccionado.id] || [];
    const getDefaults = PERMISOS_PREDETERMINADOS[rolSeleccionado.nombre];
    if (Array.isArray(actual) && actual.length === 0 && typeof getDefaults === "function") {
      setPermisosAsignados((prev) => ({
        ...prev,
        [rolSeleccionado.id]: getDefaults(),
      }));
    }
  }, [rolSeleccionado, permisos]); // eslint-disable-line

  // ---------- Utilidades UI ----------
  const permisosCol = useMemo(() => {
    const arr = Array.isArray(permisos) ? permisos : [];
    const mitad = Math.ceil(arr.length / 2);
    return [arr.slice(0, mitad), arr.slice(mitad)];
  }, [permisos]);

  const rolesFiltrados = (arr) => {
    const q = buscador.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((r) => r.nombre.toLowerCase().includes(q));
  };

  const togglePermiso = (permNombre) => {
    if (!rolSeleccionado) return;
    if (esSuperadmin) return;
    if (esAdmin && PERMISOS_BLOQUEADOS_ADMIN.has(permNombre)) return;

    const rid = rolSeleccionado.id;
    setPermisosAsignados((prev) => {
      const actual = prev[rid] || [];
      const existe = actual.includes(permNombre);
      const nuevo = existe ? actual.filter((p) => p !== permNombre) : [...actual, permNombre];
      return { ...prev, [rid]: nuevo };
    });
  };

  const seleccionarTodo = () => {
    if (!rolSeleccionado || esSuperadmin) return;
    const rid = rolSeleccionado.id;
    setPermisosAsignados((prev) => ({
      ...prev,
      [rid]: (permisos || []).map((p) => p.nombre), // ya sin BALANZA y ordenado
    }));
  };

  const quitarTodo = () => {
    if (!rolSeleccionado || esSuperadmin) return;
    const rid = rolSeleccionado.id;
    if (esAdmin) {
      setPermisosAsignados((prev) => {
        const actuales = prev[rid] || [];
        const filtrados = actuales.filter((p) => PERMISOS_BLOQUEADOS_ADMIN.has(p));
        const setCrit = new Set([...filtrados, ...PERMISOS_BLOQUEADOS_ADMIN]);
        return { ...prev, [rid]: Array.from(setCrit) };
      });
    } else {
      setPermisosAsignados((prev) => ({ ...prev, [rid]: [] }));
    }
  };

  // ---------- Acciones backend ----------
  const crearRol = async (nombre) => {
    const n = (nombre || "").trim();
    if (!n) return;
    try {
      await api.post("/roles", { nombre: n });
      setToast({ text: "Rol creado.", type: "success" });
      await cargar();
    } catch (e) {
      console.error(e);
      setToast({ text: "No se pudo crear el rol.", type: "danger" });
    }
  };

  const renombrarRol = async (id, nombre) => {
    try {
      await api.patch(`/roles/${id}`, { nombre });
      setToast({ text: "Rol renombrado.", type: "success" });
      await cargar();
    } catch {
      setToast({ text: "No se pudo renombrar el rol.", type: "danger" });
    }
  };

  const disableRol = async (id) => {
    const res = await api.patch(`/roles/${id}/disable`);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(res.data?.mensaje || "No se pudo deshabilitar el rol");
    }
    setToast({ text: "Rol deshabilitado.", type: "success" });
    await cargar();
  };

  const enableRol  = async (id) => {
    try {
      await api.patch(`/roles/${id}/enable`);
      setToast({ text: "Rol activado.", type: "success" });
      await cargar();
    } catch {
      setToast({ text: "No se pudo activar el rol.", type: "danger" });
    }
  };

  const eliminarRol = async (id) => {
    try {
      const res = await api.delete(`/roles/${id}`);
      if (res.status !== 204 && (res.status < 200 || res.status >= 300)) throw new Error();
      setToast({ text: "Rol eliminado.", type: "success" });
      await cargar();
    } catch {
      setToast({ text: "No se pudo eliminar el rol.", type: "danger" });
    }
  };

  const guardarPermisos = async () => {
    if (!rolSeleccionado) return;
    setGuardando(true);
    try {
      let lista = permisosAsignados[rolSeleccionado.id] || [];
      if (esSuperadmin) {
        setToast({ text: "El rol Superadmin no se puede editar.", type: "danger" });
        setGuardando(false);
        return;
      }
      if (esAdmin) {
        const setCrit = new Set([...lista, ...PERMISOS_BLOQUEADOS_ADMIN]);
        lista = Array.from(setCrit);
      }

      await api.post(`/roles/${rolSeleccionado.id}/permisos`, { permisos: lista });
      setToast({ text: "Permisos guardados.", type: "success" });

      // 🔄 Si el rol editado es el del usuario actual, refrescamos sesión/UI
      const userRoleId = usuario?.rolId ?? usuario?.rol_id ?? null;
      const afectaUsuarioActual = userRoleId && rolSeleccionado?.id === userRoleId;

      if (afectaUsuarioActual) {
        try {
          const u = JSON.parse(localStorage.getItem("usuario") || "null") || {};
          u.permisos = lista;
          localStorage.setItem("usuario", JSON.stringify(u));
        } catch {}
        if (typeof onUsuarioPermisosChange === "function") {
          onUsuarioPermisosChange(lista);
        }
        setToast({ text: "Permisos guardados. Actualizando tu sesión…", type: "success" });
        setTimeout(() => window.location.reload(), 650);
      }
    } catch (e) {
      console.error(e);
      setToast({ text: "No se pudieron guardar los permisos.", type: "danger" });
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Subvista deshabilitados ----------
  const SubvistaDeshabilitados = ({ roles, loading }) => (
    <section className="card border-0 shadow-sm">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h3 className="mb-0">Roles deshabilitados</h3>
          <input
            className="form-control form-control-sm"
            placeholder="Buscar…"
            style={{ maxWidth: 220 }}
            value={buscador}
            onChange={(e) => setBuscador(e.target.value)}
          />
        </div>

        {loading && <p className="text-muted">Cargando…</p>}
        {!loading && roles.length === 0 && <p className="text-muted">No hay roles deshabilitados.</p>}

        <ul className="list-group list-group-flush">
          {rolesFiltrados(roles).map((r) => (
            <li
              key={r.id}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>{r.nombre}</span>

              <div className="roles-actions">
                {r.sistema ? (
                  <span className="badge text-bg-secondary">bloqueado</span>
                ) : (
                  <>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => setConfirm({ action: "enable", role: r })}
                    >
                      Activar
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirm({ action: "delete", role: r })}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );

  // ---------- Render ----------
  return (
    <div className="container-fluid px-0">
      <TopToast text={toast.text} type={toast.type} onClose={() => setToast({ text: "", type: "info" })} />

      <div className="container-xxl roles-wrap">
        <div className="d-flex align-items-center justify-content-between mt-3 mb-2">
          <div className="d-flex align-items-center gap-2">
            <h2 className="mb-0 fw-bold text-primary">Gestión de Roles</h2>
          </div>

          {/* ÚNICO botón de alternancia de vistas */}
          <div className="d-flex align-items-center gap-2">
            {vista === "activos" ? (
              <button
                className="btn btn-ghost-light btn-pill shadow-sm"
                onClick={() => setVista("deshabilitados")}
              >
                Ver deshabilitados →
              </button>
            ) : (
              <button
                className="btn btn-ghost-light btn-pill shadow-sm"
                onClick={() => setVista("activos")}
              >
                ← Ver activos
              </button>
            )}
          </div>
        </div>

        {vista === "activos" ? (
          <div className="row g-4">
            {/* Col izquierda: activos */}
            <div className="col-lg-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="card-title mb-0">Roles Activos</h5>
                    <input
                      className="form-control form-control-sm"
                      placeholder="Buscar…"
                      style={{ maxWidth: 220 }}
                      value={buscador}
                      onChange={(e) => setBuscador(e.target.value)}
                    />
                  </div>

                  <ul className="list-group mb-3">
                    {rolesFiltrados(rolesActivos).map((r) => {
                      const isEditing = editing.id === r.id;
                      const isSelected = rolSeleccionado?.id === r.id;

                      // Bloqueo si es de sistema o con usuarios asignados
                      const blocked = r.sistema || ROLES_BLOQUEADOS.has(r.nombre) || (r.asignados > 0);
                      const blockReason = r.sistema
                        ? "Rol de sistema"
                        : (r.asignados > 0 ? "Tiene usuarios asignados" : "Bloqueado");

                      return (
                        <li
                          key={r.id}
                          className={`list-group-item d-flex justify-content-between align-items-center 
                            ${isSelected ? "selected-role" : ""}`}
                          onClick={() => setRolSeleccionado(r)}
                          role="button"
                        >
                          <div className="flex-grow-1 me-3">
                            {!isEditing ? (
                              <span>{r.nombre}</span>
                            ) : (
                              <input
                                className="form-control form-control-sm"
                                value={editing.value}
                                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                                style={{ maxWidth: 200 }}
                              />
                            )}
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            {blocked ? (
                              <span className="badge text-bg-secondary" title={blockReason}>bloqueado</span>
                            ) : !isEditing ? (
                              <>
                                <BtnIcon
                                  title="Editar"
                                  color="primary"
                                  variant={isSelected ? "solid" : "outline"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing({ id: r.id, value: r.nombre });
                                  }}
                                >
                                  <IconPencil />
                                </BtnIcon>

                                <BtnIcon
                                  title="Deshabilitar"
                                  color="danger"
                                  variant={isSelected ? "solid" : "outline"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirm({ action: "disable", role: r });
                                  }}
                                >
                                  <IconBan />
                                </BtnIcon>
                              </>
                            ) : (
                              <>
                                <BtnIcon
                                  title="Guardar"
                                  color="success"
                                  variant={isSelected ? "solid" : "outline"}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const nuevo = editing.value.trim();
                                    if (!nuevo || nuevo === r.nombre) {
                                      setEditing({ id: null, value: "" });
                                      return;
                                    }
                                    await renombrarRol(r.id, nuevo);
                                    setEditing({ id: null, value: "" });
                                  }}
                                >
                                  <IconCheck />
                                </BtnIcon>

                                <BtnIcon
                                  title="Cancelar"
                                  color="danger"
                                  variant={isSelected ? "solid" : "outline"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditing({ id: null, value: "" });
                                  }}
                                >
                                  <IconX />
                                </BtnIcon>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            {/* Col derecha: permisos */}
            <div className="col-lg-8">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body">
                  {rolSeleccionado ? (
                    <>
                      <h5>Permisos de {rolSeleccionado.nombre}</h5>

                      {/* barra acciones permisos */}
                      <div
                        className={`perm-toolbar d-flex align-items-center gap-2 mb-2 ${
                          esSuperadmin ? "locked-toolbar" : ""
                        }`}
                      >
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={seleccionarTodo}
                          disabled={esSuperadmin}
                        >
                          Seleccionar todo
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={quitarTodo}
                          disabled={esSuperadmin}
                        >
                          Quitar todo
                        </button>
                        <div className="ms-auto" />
                        <button
                          className="btn btn-primary"
                          disabled={guardando || esSuperadmin}
                          onClick={guardarPermisos}
                        >
                          {guardando ? "Guardando..." : "Guardar cambios"}
                        </button>
                      </div>

                      <div className="row perm-list">
                        {permisosCol.map((col, idx) => (
                          <div className="col-md-6" key={idx}>
                            {col.map((perm) => {
                              const checked = esSuperadmin ? true : (permisosAsignados[rolSeleccionado.id] || []).includes(perm.nombre);
                              const disabled = esSuperadmin || (esAdmin && PERMISOS_BLOQUEADOS_ADMIN.has(perm.nombre));
                              return (
                                <label key={perm.id} className="form-check form-switch">
                                  <input
                                    type="checkbox"
                                    className="form-check-input"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => togglePermiso(perm.nombre)}
                                  />
                                  {perm.nombre}
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      <hr className="my-3" />
                      {!creandoNuevo ? (
                        <button className="btn btn-primary" onClick={() => setCreandoNuevo(true)}>
                          Crear nuevo rol
                        </button>
                      ) : (
                        // Fila para crear rol
                        <div className="new-role-row">
                          <input
                            className="form-control form-control-sm"
                            style={{ width: 300 }}
                            placeholder="Nombre del nuevo rol…"
                            value={nuevoRol}
                            onChange={(e) => setNuevoRol(e.target.value)}
                          />
                          <button
                            className="btn btn-success btn-sm"
                            onClick={async () => {
                              if (!nuevoRol.trim()) return;
                              await crearRol(nuevoRol);
                              setNuevoRol("");
                              setCreandoNuevo(false);
                            }}
                          >
                            Guardar
                          </button>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => { setNuevoRol(""); setCreandoNuevo(false); }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-muted">Selecciona un rol para editar permisos.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Subvista: DESHABILITADOS
          <div className="row g-4">
            <div className="col-12">
              <SubvistaDeshabilitados
                roles={rolesOff}
                loading={cargando}
              />
            </div>
          </div>
        )}
      </div>

      {/* ===== Modal de confirmación bonito ===== */}
      <Modal
        open={!!confirm}
        title="Confirmar"
        description={
          confirm
            ? confirm.action === "disable"
              ? <>¿Deshabilitar <b>{confirm.role.nombre}</b>?</>
              : confirm.action === "enable"
              ? <>¿Activar <b>{confirm.role.nombre}</b>?</>
              : <>¿Eliminar permanentemente <b>{confirm.role.nombre}</b>?</>
            : ""
        }
        confirmText={
          confirm
            ? confirm.action === "disable"
              ? "Sí, deshabilitar"
              : confirm.action === "enable"
              ? "Sí, activar"
              : "Sí, eliminar"
            : "Confirmar"
        }
        cancelText="Cancelar"
        variant={
          confirm
            ? (confirm.action === "delete" || confirm.action === "disable" ? "danger"
              : confirm.action === "enable" ? "success" : "primary")
            : "primary"
        }
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            if (confirm.action === "disable") await disableRol(confirm.role.id);
            if (confirm.action === "enable")  await enableRol(confirm.role.id);
            if (confirm.action === "delete")  await eliminarRol(confirm.role.id);
          } catch (e) {
            setToast({ text: e.message || "Operación no realizada.", type: "danger" });
          } finally {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
