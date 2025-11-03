// src/Login.js
import React, { useState, useMemo, useEffect } from "react";
import "./login.css";
import "./Usuarios.css"; // para .is-invalid/.is-valid/.hint-bad
import Avatar3D from "./ui/Avatar3D";
import http from "./config/api";

const emailOk = (v = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

/* ---------------- Modal ligero (responsive / bottom-sheet en móvil) ---------------- */
function Modal({ open, title, children, onClose, maxWidth = 460 }) {
  if (!open) return null;

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 520px)").matches;

  const overlay = {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    background: "rgba(16,24,40,.35)",
    backdropFilter: "blur(6px)",
    zIndex: 2000,
    padding: isMobile
      ? "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)"
      : 0,
  };

  const card = {
    width: "100%",
    maxWidth: isMobile ? "100%" : maxWidth,
    background: "#fff",
    borderRadius: isMobile ? "16px 16px 0 0" : 16,
    boxShadow: "0 20px 60px rgba(16,24,40,.25)",
    padding: 18,
    border: "1px solid rgba(53,87,255,.10)",
    animation: isMobile ? "sheetIn .22s ease-out" : "popIn .14s ease-out",
  };

  const head = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottom: "1px solid #f1f5f9",
  };
  const closeBtn = {
    border: "none",
    background: "#eef2ff",
    color: "#1e3a8a",
    borderRadius: 8,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={card}>
        <div style={head}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button style={closeBtn} onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div style={{ paddingTop: 12 }}>{children}</div>
      </div>

      {/* keyframes locales del modal */}
      <style>{`
        @keyframes sheetIn { from { transform: translateY(12%); opacity:.9; } to { transform: translateY(0); opacity:1; } }
        @keyframes popIn   { from { transform: scale(.98);        opacity:.8; } to { transform: scale(1);  opacity:1; } }
      `}</style>
    </div>
  );
}

/* ---------------- Iconos (SVG) ---------------- */
const IconUser = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const IconLock = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8 10V7a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const IconMail = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
    <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/* ---------------- Iconitos ojo ---------------- */
const IconEye = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const IconEyeOff = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />
    <path
      d="M10.58 10.58A3 3 0 0012 15a3 3 0 002.42-4.42M9.88 5.09A10.42 10.42 0 0112 5c7 0 11 7 11 7a18.93 18.93 0 01-5.06 5.79M6.1 6.1A18.72 18.72 0 001 12s4 7 11 7a10.39 10.39 0 004.22-.86"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

/* ---------------- Campo de texto con icono a la izquierda ---------------- */
function TextFieldWithIcon({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  title,
  disabled,
  className = "",
  leftIcon = null,
  ariaInvalid = false,
  ...rest
}) {
  const wrap = { position: "relative", display: "block" };
  const left = {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#64748b",
    width: 22,
    height: 22,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  };

  return (
    <div style={wrap} className="input-wrap">
      {leftIcon ? <span className="input-icon" style={left}>{leftIcon}</span> : null}
      <input
        id={id}
        className={`input ${className}`}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        style={{ paddingLeft: leftIcon ? 40 : undefined }}
        {...rest}
      />
    </div>
  );
}

/* ---------------- Campo de contraseña con icono + ojo ---------------- */
function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  title,
  disabled,
  secure = true,
  className = "",
  ariaInvalid = false,
  leftIcon = null,
}) {
  const [show, setShow] = useState(false);

  const blockEvent = (e) => e.preventDefault();
  const secureProps = secure
    ? {
        onPaste: blockEvent,
        onCopy: blockEvent,
        onCut: blockEvent,
        onDrop: blockEvent,
        onDragStart: blockEvent,
        onContextMenu: blockEvent,
        spellCheck: false,
      }
    : {};

  const wrapper = { position: "relative", display: "block" };
  const eyeBtn = {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    background: "transparent",
    color: "#64748b",
    cursor: "pointer",
    borderRadius: 10,
  };
  const left = {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#64748b",
    width: 22,
    height: 22,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
  };

  return (
    <div style={wrapper} className="input-wrap">
      {leftIcon ? <span className="input-icon" style={left}>{leftIcon}</span> : null}
      <input
        id={id}
        type={show ? "text" : "password"}
        className={`input ${className}`}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        style={{ paddingRight: 48, paddingLeft: leftIcon ? 40 : undefined }}
        aria-invalid={ariaInvalid}
        {...secureProps}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        style={eyeBtn}
      >
        {show ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

// ===== util seguridad global =====
const blockEvent = (e) => e.preventDefault();
const securePropsGlobal = {
  onPaste: blockEvent,
  onCopy: blockEvent,
  onCut: blockEvent,
  onDrop: blockEvent,
  onDragStart: blockEvent,
  onContextMenu: blockEvent,
  spellCheck: false,
};

// regex fuerte
const STRONG_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const isStrong = (pwd) => STRONG_RE.test(String(pwd || ""));

// ===== utilidades de tiempo / cooldown =====
function secToHuman(sec = 0) {
  if (!sec || sec < 1) return "unos segundos";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((h ? sec - h * 3600 : sec) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} hora${h > 1 ? "s" : ""}`;
  if (m) return `${m} minuto${m > 1 ? "s" : ""}`;
  const s = Math.floor(sec % 60);
  return `${s} s`;
}

function getRetryAfterSeconds(res, data) {
  const hdr = res?.headers?.["retry-after"];
  if (hdr && !Number.isNaN(Number(hdr))) return Number(hdr);
  if (typeof data?.retryAfterSec === "number") return data.retryAfterSec;
  if (data?.nextAllowedAt) {
    const next = new Date(data.nextAllowedAt).getTime();
    const now = Date.now();
    if (next > now) return Math.ceil((next - now) / 1000);
  }
  return null;
}

export default function Login() {
  const [usuario, setUsuario] = useState("admin");
  const [contrasena, setContrasena] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Estado de cambio de contraseña (primera vez)
  const [pwDialog, setPwDialog] = useState({ open: false, usuarioId: null, usuario: "" });
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  // Estado de validación "no reutilizar últimas 5"
  const [reuseStatus, setReuseStatus] = useState("idle");

  // Modal de recuperar
  const [recOpen, setRecOpen] = useState(false);
  const [recUsuario, setRecUsuario] = useState(() => usuario || "");
  const [recCorreo, setRecCorreo] = useState("");
  const [recMsg, setRecMsg] = useState("");
  const [recOk, setRecOk] = useState(false);
  const [recLoading, setRecLoading] = useState(false);

  // Limpiar sesión previa al entrar al login
  useEffect(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
  }, []);

  // checklist visual
  const checklist = useMemo(
    () => ({
      length: (nueva || "").length >= 8,
      upper: /[A-Z]/.test(nueva || ""),
      number: /\d/.test(nueva || ""),
      special: /[^A-Za-z0-9]/.test(nueva || ""),
    }),
    [nueva]
  );

  const match = (nueva || "") === (confirm || "");
  const mismatch = (confirm || "").length > 0 && !match;

  // validación en vivo contra historial (debounced)
  useEffect(() => {
    if (!pwDialog.open || !pwDialog.usuarioId) return;
    if (!nueva || !isStrong(nueva)) {
      setReuseStatus("idle");
      return;
    }

    let alive = true;
    setReuseStatus("checking");

    const t = setTimeout(async () => {
      try {
        const { data } = await http.post(`/usuarios/${pwDialog.usuarioId}/validar-nueva`, {
          actual, nueva
        });
        if (!alive) return;
        if (data && typeof data.reutilizada === "boolean") {
          setReuseStatus(data.reutilizada ? "bad" : "ok");
        } else {
          setReuseStatus("error");
        }
      } catch {
        if (alive) setReuseStatus("error");
      }
    }, 350);

    return () => { alive = false; clearTimeout(t); };
  }, [nueva, actual, pwDialog.open, pwDialog.usuarioId]);

  const canSaveNew =
    actual && nueva && confirm && isStrong(nueva) && match && reuseStatus === "ok" && !savingNew;

  /* ====== LOGIN ====== */
  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      // Nuevo endpoint unificado
      const resp = await http.post("/usuarios/login", { usuario, contrasena });

      // éxito normal: { ok:true, token, usuario }
      if (resp?.data?.token && resp?.data?.usuario) {
        localStorage.setItem("token", resp.data.token);
        localStorage.setItem("usuario", JSON.stringify(resp.data.usuario));
        window.location.href = "/inicio";
        return;
      }

      setMsg("Respuesta inesperada del servidor.");
    } catch (err) {
      const status = err?.response?.status;
      const data   = err?.response?.data || {};

      // caso: debe cambiar contraseña primero (403 + code FIRST_CHANGE_REQUIRED)
      if (status === 403 && data?.code === "FIRST_CHANGE_REQUIRED" && data?.usuario) {
        setPwDialog({ open: true, usuarioId: data.usuario.id, usuario: data.usuario.usuario });
        setActual(contrasena);
        setNueva(""); setConfirm(""); setReuseStatus("idle");
        setMsg("Debes cambiar tu contraseña para continuar.");
        setLoading(false);
        return;
      }

      const serverMsg = data?.mensaje || data?.error || "No se pudo iniciar sesión.";
      setMsg(serverMsg);
    } finally {
      setLoading(false);
    }
  }

  /* ===== RECUPERAR: mensajes precisos y cooldown ===== */
  async function enviarRecuperacion(e) {
    e.preventDefault();
    setRecMsg(""); setRecOk(false);

    const u = (recUsuario || "").trim();
    const m = (recCorreo || "").trim().toLowerCase();
    if (!u || !m) { setRecMsg("Ingresa usuario y correo."); return; }
    if (!emailOk(m)) { setRecMsg("Ingresa un correo válido."); return; }

    setRecLoading(true);
    try {
      const { data } = await http.post(`/usuarios/recuperar`, { usuario: u, correo: m });

      if (data?.ok || data?.code === "OK_SENT") {
        setRecOk(true);
        setRecMsg(data?.mensaje || `Te enviamos un correo a ${m} con instrucciones.`);
        return;
      }

      if (data?.code === "MISMATCH") {
        setRecOk(false);
        setRecMsg("Usuario y correo no coinciden.");
        return;
      }
      if (data?.code === "NO_USER" || data?.code === "NO_EMAIL") {
        setRecOk(false);
        setRecMsg(data?.mensaje || "No encontramos un usuario/correo válido.");
        return;
      }
      if (data?.code === "COOLDOWN") {
        const sec = getRetryAfterSeconds(null, data);
        const when = sec != null ? ` Podrás intentar de nuevo en ${secToHuman(sec)}.` : "";
        setRecOk(false);
        setRecMsg((data?.mensaje || "Ya se solicitó un restablecimiento recientemente.") + when);
        return;
      }

      setRecOk(false);
      setRecMsg(data?.mensaje || "No se pudo procesar la solicitud.");
    } catch (err) {
      setRecOk(false);
      setRecMsg("No se pudo contactar el servidor. Intenta más tarde.");
    } finally {
      setRecLoading(false);
    }
  }

  /* ===== CAMBIO DE CONTRASEÑA: cooldown y mensajes claros ===== */
  async function guardarNuevaPassword() {
    if (!pwDialog.usuarioId) return;
    setMsg("");

    if (!isStrong(nueva)) { setMsg("La nueva contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un caracter especial."); return; }
    if (!match) { setMsg("La confirmación no coincide."); return; }
    if (reuseStatus !== "ok") { setMsg("La nueva contraseña no debe coincidir con tus últimas 5 contraseñas."); return; }

    setSavingNew(true);
    try {
      const { data } = await http.post(
        `/usuarios/${pwDialog.usuarioId}/cambiar-password-primera-vez`,
        { actual, nueva }
      );

      if (data?.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("usuario", JSON.stringify(data.usuario));
        setPwDialog({ open: false, usuarioId: null, usuario: "" });
        window.location.href = "/inicio";
        return;
      }

      if (data?.code === "COOLDOWN") {
        const sec = getRetryAfterSeconds(null, data);
        const extra = sec != null ? ` Debes esperar ${secToHuman(sec)} para volver a cambiarla.` : "";
        setMsg((data?.mensaje || "Has cambiado tu contraseña hace poco.") + extra);
        return;
      }

      setMsg(data?.mensaje || "No se pudo cambiar la contraseña.");
    } catch (e) {
      setMsg("No se pudo cambiar la contraseña.");
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className="login-hero">
      <span className="bubble b1" aria-hidden />
      <span className="bubble b2" aria-hidden />
      <span className="bubble b3" aria-hidden />

      <div className="login-card" role="main" aria-labelledby="login-title">
        <div className="login-left">
          <div className="brand-box">
            <Avatar3D size={200} />
            <h1 id="login-title">Hospital Santa Bárbara</h1>
            <p className="tagline">Cuidando la salud y el entorno</p>
          </div>
        </div>

        <div className="login-right">
          <form onSubmit={onSubmit} className="form-box" aria-describedby="form-desc">
            <h2>Iniciar Sesión</h2>
            <p id="form-desc" className="form-desc">Ingrese sus credenciales</p>

            <label htmlFor="usuario" className="label">Usuario</label>
            <TextFieldWithIcon
              id="usuario"
              className="input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              placeholder="Ingrese su usuario"
              required
              leftIcon={<IconUser />}
              {...securePropsGlobal}
            />

            <label htmlFor="pwd" className="label">Contraseña</label>
            <PasswordField
              id="pwd"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              title="Por seguridad, escribe la contraseña (pegar está deshabilitado)."
              secure
              leftIcon={<IconLock />}
            />

            {msg && <div className="alert" role="alert">{msg}</div>}

            <button className="btn" disabled={loading} aria-busy={loading} aria-live="polite">
              {loading ? "Ingresando..." : "Ingresar"}
            </button>

            <button
              type="button"
              className="mini-link"
              onClick={() => { setRecUsuario(usuario || ""); setRecOpen(true); }}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        </div>
      </div>

      {/* Modal de cambio de contraseña (primera vez) */}
      <Modal
        open={pwDialog.open}
        title="Cambiar contraseña"
        onClose={() => setPwDialog({ open: false, usuarioId: null, usuario: "" })}
      >
        <div className="u-form" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <label>Usuario
            <input value={pwDialog.usuario || ""} disabled />
          </label>

          <label>Contraseña temporal
            <PasswordField
              id="temp-pass"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="Tu contraseña temporal"
              autoComplete="one-time-code"
              title="Escribe la contraseña temporal (pegar está deshabilitado)."
              secure
              leftIcon={<IconLock />}
            />
          </label>

          <label>Nueva contraseña
            <PasswordField
              id="new-pass"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              title="Debe incluir mayúscula, número y caracter especial. Pegar está deshabilitado."
              secure
              className={mismatch && nueva ? "is-invalid" : (match && confirm ? "is-valid" : "")}
              ariaInvalid={mismatch && !!nueva && !!confirm}
              leftIcon={<IconLock />}
            />
          </label>

          {/* Checklist de requisitos */}
          <div style={{ fontSize: 12, color: "#475569" }}>
            <div style={{ marginTop: -6, marginBottom: 4 }}>La nueva contraseña debe incluir:</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li style={{ color: checklist.length ? "#16a34a" : "#64748b" }}>
                Mínimo 8 caracteres
              </li>
              <li style={{ color: checklist.upper ? "#16a34a" : "#64748b" }}>
                Al menos 1 letra mayúscula
              </li>
              <li style={{ color: checklist.number ? "#16a34a" : "#64748b" }}>
                Al menos 1 número
              </li>
              <li style={{ color: checklist.special ? "#16a34a" : "#64748b" }}>
                Al menos 1 caracter especial
              </li>
              <li style={{ color: reuseStatus === "ok" ? "#16a34a" : reuseStatus === "bad" ? "#dc2626" : reuseStatus === "error" ? "#b45309" : "#64748b" }}>
                {reuseStatus === "checking"
                  ? "Validando contra tus últimas 5..."
                  : reuseStatus === "ok"
                    ? "No coincide con tus 5 últimas contraseñas"
                    : reuseStatus === "bad"
                      ? "Coincide con una de tus últimas 5 (elige otra)"
                      : reuseStatus === "error"
                        ? "No se pudo validar historial"
                        : "Pendiente de validar"}
              </li>
            </ul>
          </div>

          <label>Confirmar nueva contraseña
            <PasswordField
              id="confirm-pass"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la nueva contraseña"
              autoComplete="new-password"
              title="Vuelve a escribir la contraseña (pegar está deshabilitado)."
              secure
              className={mismatch ? "is-invalid" : (match && confirm ? "is-valid" : "")}
              ariaInvalid={mismatch}
              leftIcon={<IconLock />}
            />
            {mismatch
              ? <div className="hint-bad">Las contraseñas no coinciden.</div>
              : <div className="hint-muted">Repite la nueva contraseña.</div>}
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              type="button"
              className="btn"
              onClick={guardarNuevaPassword}
              disabled={!canSaveNew}
              title={!canSaveNew ? "Revisa los requisitos y que las contraseñas coincidan" : ""}
            >
              {savingNew ? "Guardando..." : "Guardar y entrar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de RECUPERAR contraseña (usuario + correo) */}
      <Modal
        open={recOpen}
        title="Recuperar contraseña"
        onClose={() => { setRecOpen(false); setRecMsg(""); setRecOk(false); }}
      >
        <form onSubmit={enviarRecuperacion} className="u-form" style={{ display: "grid", gap: 10 }}>
          <label>Usuario
            <TextFieldWithIcon
              className="input"
              value={recUsuario}
              onChange={(e) => setRecUsuario(e.target.value)}
              placeholder="Tu usuario"
              autoComplete="username"
              required
              leftIcon={<IconUser />}
              {...securePropsGlobal}
            />
          </label>

          <label>Correo
            <TextFieldWithIcon
              className="input"
              type="email"
              value={recCorreo}
              onChange={(e) => setRecCorreo(e.target.value.trim().toLowerCase())}
              placeholder="tucorreo@ejemplo.com"
              autoComplete="email"
              required
              leftIcon={<IconMail />}
            />
          </label>

          {recMsg && (
            <div className={`alert ${recOk ? "ok" : ""}`} role="alert">{recMsg}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" onClick={() => setRecOpen(false)}>
              Cerrar
            </button>
            <button type="submit" className="btn" disabled={recLoading}>
              {recLoading ? "Enviando..." : "Enviar instrucciones"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
