// src/Recuperar.js
import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./login.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const emailOk = (v = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

export default function Recuperar() {
  const location = useLocation();

  const [usuario, setUsuario] = useState("");
  const [correo, setCorreo] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const userRef = useRef(null);
  const mailRef = useRef(null);

  // Precargar desde query (?usuario= & ?correo=)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const u = params.get("usuario");
    const m = params.get("correo");
    if (u && !usuario) setUsuario(u);
    if (m && !correo) setCorreo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // Foco inicial inteligente
  useEffect(() => {
    if (!usuario && userRef.current) userRef.current.focus();
    else if (!correo && mailRef.current) mailRef.current.focus();
  }, [usuario, correo]);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setOk(false);

    const usr = usuario.trim();
    const mail = correo.trim().toLowerCase();

    if (!usr || !mail) {
      setMsg("Ingresa usuario y correo.");
      return;
    }
    if (!emailOk(mail)) {
      setMsg("Ingresa un correo válido.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usr, correo: mail }),
      });
      const data = await res.json();

      // Mensaje neutro (no revela si existe)
      setOk(true);
      setMsg(
        data?.mensaje ||
          "Si los datos coinciden, te enviamos un correo con instrucciones."
      );
    } catch {
      setOk(true);
      setMsg(
        "Si los datos coinciden, te enviamos un correo con instrucciones."
      );
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = usuario.trim() && correo.trim() && !loading;

  return (
    <div className="login-hero">
      <span className="bubble b1" aria-hidden />
      <span className="bubble b2" aria-hidden />
      <span className="bubble b3" aria-hidden />

      <div className="login-card" role="main" aria-labelledby="rec-title">
        <div className="login-left">
          <div className="brand-box">
            <img
              src="/logocircular.png"
              alt="Logo Hospital Santa Bárbara"
              className="logo"
            />
            <h1 id="rec-title">Hospital Santa Bárbara</h1>
            <p className="tagline">Cuidando la salud y el entorno</p>
          </div>
        </div>

        <div className="login-right">
          <form
            onSubmit={onSubmit}
            className="form-box"
            aria-describedby="form-desc"
          >
            <h2>Recuperar contraseña</h2>
            <p id="form-desc" className="form-desc">
              Ingresa tu usuario y correo. Si coinciden, te enviaremos una
              contraseña temporal.
            </p>

            <label className="label" htmlFor="usr">
              Usuario
            </label>
            <input
              id="usr"
              className="input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              placeholder="Tu usuario"
              required
              ref={userRef}
            />

            <label className="label" htmlFor="mail">
              Correo
            </label>
            <input
              id="mail"
              className="input"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              onBlur={(e) => setCorreo(e.target.value.trim().toLowerCase())}
              autoComplete="email"
              placeholder="tucorreo@ejemplo.com"
              required
              ref={mailRef}
            />

            {msg && (
              <div
                className={`alert ${ok ? "ok" : ""}`}
                role="alert"
                style={{ marginTop: 8 }}
              >
                {msg}
              </div>
            )}

            <button
              type="submit"
              className="btn"
              disabled={!canSubmit}
              aria-busy={loading}
            >
              {loading ? "Enviando..." : "Enviar instrucciones"}
            </button>

            <Link className="mini-link" to="/">
              Volver al inicio de sesión
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
