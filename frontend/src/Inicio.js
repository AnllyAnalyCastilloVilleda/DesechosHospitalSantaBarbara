// src/Inicio.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./inicio.css";
import { http } from "./config/api";

/**
 * Props:
 * - usuario: objeto usuario
 * - onGo?: (vistaId: string) => void  // opcional, si llega, hace clicables los tiles
 */
export default function Inicio({ usuario = {}, onGo }) {
  // ===== body class solo en esta página =====
  useEffect(() => {
    document.body.classList.add("inicio-page");
    return () => document.body.classList.remove("inicio-page");
  }, []);

  // ===== KPIs desde backend =====
  const [kpi, setKpi] = useState({ bolsasRegistradas: 0, lbSemana: 0, areasActivas: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const loadKpis = async () => {
    try {
      setErr("");
      const { data } = await http.get("/api/dashboard/kpis");
      setKpi({
        bolsasRegistradas: Number(data?.bolsasRegistradas ?? 0),
        lbSemana: Number(data?.lbSemana ?? 0),
        areasActivas: Number(data?.areasActivas ?? 0),
      });
    } catch (e) {
      setErr("No se pudieron cargar los indicadores.");
      setKpi({ bolsasRegistradas: 0, lbSemana: 0, areasActivas: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadKpis();
    })();
    // refresco cada 60s
    const id = setInterval(() => { if (alive) loadKpis(); }, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ===== Formateadores =====
  const fmt = useMemo(() => new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 }), []);
  const abbr = (n) => {
    const x = Number(n || 0);
    if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`;
    if (x >= 1_000)     return `${(x / 1_000).toFixed(1)}k`;
    return fmt.format(x);
  };

  // ===== Ping visual cuando cambian los KPIs =====
  const [ping, setPing] = useState(false);
  const prevRef = useRef(kpi);
  useEffect(() => {
    if (
      prevRef.current.bolsasRegistradas !== kpi.bolsasRegistradas ||
      prevRef.current.lbSemana !== kpi.lbSemana ||
      prevRef.current.areasActivas !== kpi.areasActivas
    ) {
      setPing(true);
      const t = setTimeout(() => setPing(false), 600);
      prevRef.current = kpi;
      return () => clearTimeout(t);
    }
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

  const stats = [
    { key: "bolsasRegistradas", label: "Bolsas registradas", value: loading ? "…" : abbr(kpi.bolsasRegistradas), icon: "🗳️" },
    { key: "lbSemana",          label: "lb recolectadas (semana)", value: loading ? "…" : abbr(kpi.lbSemana), icon: "⚖️" },
    { key: "areasActivas",      label: "Áreas activas", value: loading ? "…" : abbr(kpi.areasActivas), icon: "🏥" },
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

  // helper para CTA: si hay onGo, que sea botón; si no, estático
  const Cta = ({ to, icon, title, hint, tone }) => {
    const className = `cta ${tone} ${onGo ? "" : "cta-static"}`;
    return onGo ? (
      <button
        type="button"
        className={className}
        onClick={() => onGo(to)}
        aria-label={title}
      >
        <span className="cta-ico" aria-hidden>{icon}</span>
        {title}
        <small className="cta-hint">{hint}</small>
      </button>
    ) : (
      <div className={`${className}`} role="note" aria-label={title}>
        <span className="cta-ico" aria-hidden>{icon}</span>
        {title}
        <small className="cta-hint">{hint}</small>
      </div>
    );
  };

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

          {/* Resumen/acciones */}
          <div className={`action-grid ${onGo ? "" : "neutral-grid"}`} aria-label="Acciones principales">
            <Cta to="registro" icon="🧾" title="Registro de bolsas" hint="Carga diaria por área, peso y tipo" tone="cta-green" />
            <Cta to="qrs" icon="🔗" title="Códigos QR" hint="Trazabilidad de bolsas y escaneo" tone="cta-cyan" />
            <Cta to="estadisticas" icon="📊" title="Estadísticas" hint="Indicadores y reportes del sistema" tone="cta-ghost" />
          </div>

          {err && (
            <div className="hero-error" role="alert">
              {err} <button className="btn-retry" onClick={loadKpis}>Reintentar</button>
            </div>
          )}
        </div>
      </section>

      {/* KPIs */}
      <section className="stats" aria-label="Indicadores rápidos">
        {stats.map((s) => {
          const tone = kpiTone(s.key, loading ? 0 : (s.key === "bolsasRegistradas" ? kpi.bolsasRegistradas :
                                                      s.key === "lbSemana" ? kpi.lbSemana : kpi.areasActivas));
        return (
          <div
            key={s.key}
            className={`stat-card ${tone} ${ping ? "ping" : ""} ${loading ? "is-loading" : ""}`}
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
          <div className="strip-track" aria-hidden="true">
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
