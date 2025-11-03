// src/Inicio.js
import React, { useEffect, useMemo, useState } from "react";
import "./inicio.css";
import { http } from "./config/api";

/**
 * Props:
 * - usuario: objeto usuario
 */
export default function Inicio({ usuario = {} }) {
  // Solo para esta página: quitar marco de .contenido (shell)
  useEffect(() => {
    document.body.classList.add("inicio-page");
    return () => document.body.classList.remove("inicio-page");
  }, []);

  // ===== KPIs desde backend =====
  const [kpi, setKpi] = useState({ bolsasRegistradas: 0, lbSemana: 0, areasActivas: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    http
      .get("/api/dashboard/kpis")
      .then(({ data }) => { if (alive) setKpi(data); })
      .catch(() => { if (alive) setKpi({ bolsasRegistradas: 0, lbSemana: 0, areasActivas: 0 }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // ===== Formateador =====
  const fmt = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 });

  // ===== Ping visual cuando cambian los KPIs =====
  const [ping, setPing] = useState(false);
  useEffect(() => {
    setPing(true);
    const t = setTimeout(() => setPing(false), 600);
    return () => clearTimeout(t);
  }, [kpi]);

  const kpiTone = (key, val) => {
    const n = Number(val) || 0;
    if (key === "lbSemana") {
      if (n >= 80) return "ok";
      if (n > 0) return "warn";
      return "muted";
    }
    if (key === "bolsasRegistradas") {
      if (n >= 10) return "ok";
      if (n > 0) return "warn";
      return "muted";
    }
    if (key === "areasActivas") return n > 0 ? "info" : "muted";
    return "";
  };

  const bolsasRegVal = loading ? "…" : fmt.format(kpi.bolsasRegistradas ?? 0);

  const stats = [
    { key: "bolsasRegistradas", label: "Bolsas registradas", value: bolsasRegVal, icon: "🗳️" },
    { key: "lbSemana",          label: "lb recolectadas (semana)", value: loading ? "…" : fmt.format(kpi.lbSemana), icon: "⚖️" },
    { key: "areasActivas",      label: "Áreas activas", value: loading ? "…" : fmt.format(kpi.areasActivas), icon: "🏥" },
  ];

  // ===== Tips rotativos =====
  const tips = useMemo(
    () => [
      "Separa por color: rojo (peligroso), verde (orgánico), azul (reciclable).",
      "Etiqueta cada bolsa con área, fecha y responsable para trazabilidad.",
      "Llena las bolsas al 75–80% para evitar rupturas y derrames.",
      "Desinfecta contenedores semanalmente; verifica tapas y ruedas.",
      "Usa guantes y nunca compactes con las manos: ¡seguridad primero!",
    ],
    []
  );
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % tips.length), 6000);
    return () => clearInterval(id);
  }, [tips.length]);

  // ===== Datos curiosos / banner =====
  const facts = useMemo(
    () => [
      "Reciclar 1 tonelada de papel salva ~17 árboles.",
      "Un guante mal dispuesto puede contaminar una bolsa completa.",
      "Clasificar bien reduce hasta 30% el costo de disposición.",
      "Las bolsas no deben superar 8–10 kg para evitar accidentes.",
      "Rotula las bolsas: área, fecha y responsable.",
    ],
    []
  );

  // ===== Buenas prácticas =====
  const features = [
    { title: "Clasificación adecuada", img: "/basureros.jpg",
      text: "Separar residuos correctamente evita contagios y mejora el manejo hospitalario." },
    { title: "Protección ambiental", img: "/ambiente.avif",
      text: "Reducimos la contaminación y cuidamos el entorno al gestionar desechos correctamente." },
    { title: "Concientización", img: "/concientizar.jpg",
      text: "Capacitamos al personal para mejorar la cultura del manejo de residuos y prevenir riesgos." },
  ];

  return (
    <div className="inicio-wrap" data-reduce="0">
      {/* Burbujas decorativas */}
      <span className="bub b1" aria-hidden />
      <span className="bub b2" aria-hidden />
      <span className="bub b3" aria-hidden />

      {/* HERO */}
      <section className="hero hero-bleed">
        <div className="hero-bg" aria-hidden />
        <div className="hero-inner">
          <header className="hero-title">
            <h1 className="hero-heading">Panel principal</h1>
            <p className="subtitle">
              Este sistema te ayuda a gestionar residuos hospitalarios de forma segura y organizada.
            </p>
            <p className="quote">“Cuidar el entorno empieza desde el lugar donde salvamos vidas.”</p>
          </header>

          {/* Resumen inicial neutro (sin botones, no clicable) */}
          <div className="action-grid neutral-grid" aria-label="Resumen general">
            <div className="cta cta-green cta-static" role="note" aria-label="Registro de bolsas">
              <span className="cta-ico" aria-hidden>🧾</span>
              Registro de bolsas
              <small className="cta-hint">Carga diaria por área, peso y tipo</small>
            </div>
            <div className="cta cta-cyan cta-static" role="note" aria-label="Códigos QR">
              <span className="cta-ico" aria-hidden>🔗</span>
              Códigos QR
              <small className="cta-hint">Trazabilidad de bolsas y escaneo</small>
            </div>
            <div className="cta cta-ghost cta-static" role="note" aria-label="Estadísticas">
              <span className="cta-ico" aria-hidden>📊</span>
              Estadísticas
              <small className="cta-hint">Indicadores y reportes del sistema</small>
            </div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="stats" aria-label="Indicadores rápidos">
        {stats.map((s) => {
          const tone = kpiTone(s.key, s.value);
          return (
            <div
              key={s.key}
              className={`stat-card ${tone} ${ping ? "ping" : ""}`}
              role="status"
              aria-live="polite"
            >
              <div className="stat-ico" aria-hidden>{s.icon}</div>
              <div className="stat-val">{s.value}</div>
              <div className="stat-lab">{s.label}</div>
            </div>
          );
        })}
      </section>

      {/* Eco-tip + Banner */}
      <section className="tips-and-strip">
        <div className="eco-tip" aria-live="polite">
          <span className="leaf" aria-hidden />
          <b>Eco-tip:</b> {tips[tipIndex]}
        </div>

        <div className="info-strip" aria-label="Datos útiles sobre residuos">
          <div className="strip-track">
            {facts.map((f, i) => (
              <span className="strip-item" key={`a-${i}`}>
                <i aria-hidden="true" />
                {f}
              </span>
            ))}
            {facts.map((f, i) => (
              <span className="strip-item" key={`b-${i}`}>
                <i aria-hidden="true" />
                {f}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Buenas prácticas */}
      <section className="cards" aria-label="Buenas prácticas">
        {features.map((f) => (
          <article key={f.title} className="card">
            <img src={f.img} alt={f.title} className="card-img" loading="lazy" />
            <h3 className="card-title">{f.title}</h3>
            <p className="card-text">{f.text}</p>
          </article>
        ))}
      </section>

      {/* Beneficios */}
      <section className="benefits">
        <h2>¿Qué te permite este sistema?</h2>
        <ul>
          <li>Registrar recolección diaria de residuos por área</li>
          <li>Visualizar estadísticas semanales y mensuales</li>
          <li>Controlar peso, tipo de bolsa y responsable</li>
          <li>Generar y escanear códigos QR para trazabilidad</li>
        </ul>
      </section>
    </div>
  );
}
