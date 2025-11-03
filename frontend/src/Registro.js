import React, { useEffect, useState } from "react";
import "./App.css";
import "./Usuarios.css"; // para estilos de hints/validaciones similares

import { http } from "./config/api";

const emailOk = (v = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(v).trim());

export default function Registro() {
  const [roles, setRoles] = useState([]);

  // formulario
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo]   = useState("");
  const [rolId, setRolId]     = useState("");

  const [mensaje, setMensaje] = useState("");
  const [tipoMsg, setTipoMsg] = useState("info"); // success | danger | info
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadRoles() {
      try {
        const { data } = await http.get("/roles", { params: { activo: true } });
        setRoles(Array.isArray(data) ? data : []);
      } catch {
        setRoles([]);
        setMensaje("⚠️ No se pudieron cargar los roles.");
        setTipoMsg("danger");
      }
    }
    loadRoles();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMensaje("");
    setTipoMsg("info");

    if (!nombre.trim() || !usuario.trim() || !correo.trim() || !rolId) {
      setMensaje("❌ Completa todos los campos obligatorios.");
      setTipoMsg("danger");
      return;
    }
    if (!emailOk(correo)) {
      setMensaje("❌ Ingresa un correo válido.");
      setTipoMsg("danger");
      return;
    }

    setLoading(true);
    try {
      // Crea usuario — el backend enviará una contraseña temporal por correo
      await http.post("/usuarios", {
        nombre: nombre.trim(),
        usuario: usuario.trim(),
        correo: correo.trim().toLowerCase(),
        rolId: Number(rolId),
      });

      setMensaje("✅ Usuario creado. Se envió una contraseña temporal al correo.");
      setTipoMsg("success");

      // limpiar
      setNombre("");
      setUsuario("");
      setCorreo("");
      setRolId("");
    } catch (e) {
      const msg = e?.response?.data?.mensaje || e?.response?.data?.message || "❌ No se pudo crear el usuario.";
      setMensaje(msg);
      setTipoMsg("danger");
    } finally {
      setLoading(false);
    }
  };

  const emailInvalid = !!correo && !emailOk(correo);

  return (
    <div className="login-container" style={{ maxWidth: 520 }}>
      <h2>Registrar Usuario</h2>

      <form onSubmit={onSubmit} className="u-form" style={{ display: "grid", gap: 12 }}>
        <label>Nombre completo
          <input
            className="u-input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellidos"
            required
          />
        </label>

        <label>Nombre de usuario
          <input
            className="u-input"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="usuario.ejemplo"
            required
          />
          {!usuario ? (
            <div className="hint-muted">Escribe un usuario.</div>
          ) : (
            <div className="hint-muted">Se verificará disponibilidad al crear.</div>
          )}
        </label>

        <label>Correo electrónico
          <input
            type="email"
            className={`u-input ${emailInvalid ? "is-invalid" : ""}`}
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="correo@ejemplo.com"
            required
          />
          {!correo ? (
            <div className="hint-muted">Escribe un correo válido.</div>
          ) : emailInvalid ? (
            <div className="hint-bad">Formato de correo inválido.</div>
          ) : (
            <div className="hint-muted">Se enviará una contraseña temporal a este correo.</div>
          )}
        </label>

        <label>Rol
          <select
            className="u-input"
            value={rolId}
            onChange={(e) => setRolId(e.target.value)}
            required
          >
            <option value="">Seleccione un rol</option>
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.nombre}
              </option>
            ))}
          </select>
        </label>

        <div className="u-form-actions" style={{ marginTop: 6 }}>
          <button type="submit" className="u-btn u-btn-primary" disabled={loading}>
            {loading ? "Registrando..." : "Registrar"}
          </button>
        </div>
      </form>

      {mensaje && (
        <p
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background:
              tipoMsg === "success" ? "#ecfdf5" :
              tipoMsg === "danger"  ? "#fef2f2" :
              "#f1f5f9",
            color:
              tipoMsg === "success" ? "#065f46" :
              tipoMsg === "danger"  ? "#7f1d1d" :
              "#0f172a",
            border:
              tipoMsg === "success" ? "1px solid #a7f3d0" :
              tipoMsg === "danger"  ? "1px solid #fecaca" :
              "1px solid #e2e8f0",
          }}
        >
          {mensaje}
        </p>
      )}
    </div>
  );
}
