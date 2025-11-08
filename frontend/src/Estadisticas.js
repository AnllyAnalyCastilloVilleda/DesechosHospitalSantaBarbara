// src/Estadisticas.js
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import "./Estadisticas.css";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Estadisticas() {
  const chartBoxRef = useRef(null);

  // =========================================================
  // Datos base (categorías)
  // =========================================================
  const labels = ["Infeccioso", "Común", "Punzocortante", "Patológico", "Especiales"];
  const valores = [40, 25, 15, 30, 20]; // kg por categoría
  const colores = ["#ff6384", "#36a2eb", "#ffcd56", "#4bc0c0", "#a167e7"];

  const total = useMemo(() => valores.reduce((a, b) => a + b, 0), [valores]);
  const porcentajes = useMemo(
    () => valores.map((v) => (total ? ((v / total) * 100).toFixed(1) : "0.0")),
    [valores, total]
  );

  // =========================================================
  // Detalle por áreas (tabla y Excel)
  // =========================================================
  const areas = ["Emergencias", "Quirófano", "Laboratorio", "Pediatría", "UCIMED", "Medicina Interna"];
  const factores = [
    [0.28, 0.18, 0.20, 0.22, 0.12], // Emergencias: reparto por categoría
    [0.22, 0.16, 0.25, 0.24, 0.13], // Quirófano
    [0.17, 0.21, 0.18, 0.20, 0.24], // Laboratorio
    [0.12, 0.17, 0.12, 0.15, 0.22], // Pediatría
    [0.11, 0.15, 0.15, 0.11, 0.16], // UCIMED
    [0.10, 0.13, 0.10, 0.08, 0.13], // Medicina Interna
  ];

  const detalleAreas = useMemo(() => {
    return areas.map((area, r) => {
      const fila = { Área: area };
      labels.forEach((cat, c) => {
        const kg = Math.round(valores[c] * (factores[r][c] ?? 0));
        fila[cat] = kg;
      });
      fila.Total = labels.reduce((a, cat) => a + (fila[cat] || 0), 0);
      return fila;
    });
  }, [areas, labels, valores]);

  // Serie mensual (12m) basada en total, con ligera variación estacional
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const mensual = useMemo(() => {
    const base = Math.round(total / 12);
    const variaciones = [1.02, 0.98, 1.04, 1.00, 1.06, 0.95, 1.08, 1.03, 0.97, 1.05, 1.01, 1.02];
    return meses.map((m, i) => ({ Mes: m, Kg: Math.round(base * variaciones[i]) }));
  }, [total]);

  // =========================================================
  // Chart.js (doughnut)
  // =========================================================
  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: "Cantidad (kg)",
          data: valores,
          backgroundColor: colores,
          borderColor: "rgba(0,0,0,.08)",
          borderWidth: 1,
          hoverOffset: 8,
        },
      ],
    }),
    [labels, valores]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 8 },
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            boxWidth: 14,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed;
              const i = ctx.dataIndex;
              return ` ${labels[i]}: ${v} kg (${porcentajes[i]}%)`;
            },
          },
        },
      },
      elements: { arc: { borderJoinStyle: "round" } },
    }),
    [labels, porcentajes]
  );

  const CenterLabel = () => (
    <div className="center-label" aria-hidden="true">
      <div className="center-total">{total} kg</div>
      <div className="center-sub">Total 12 meses</div>
    </div>
  );

  // =========================================================
  // Exportar PDF (A4, alta nitidez)
  // =========================================================
  const exportPDF = async () => {
    try {
      const input = chartBoxRef.current;
      if (!input) return;

      const canvas = await html2canvas(input, {
        backgroundColor: "#ffffff",
        scale: 3,  // mayor nitidez en PDF
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // Título + fecha
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text("Estadísticas Generales", 10, 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      const fecha = new Date().toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
      pdf.text(`Generado: ${fecha}`, 10, 18);

      // Imagen del panel
      const imgProps = pdf.getImageProperties(imgData);
      const imgW = pageW - 20;
      const imgH = (imgProps.height * imgW) / imgProps.width;
      pdf.addImage(imgData, "PNG", 10, 22, imgW, Math.min(imgH, pageH - 30));

      // Pie
      pdf.setFontSize(9);
      pdf.text("Hospital Santa Bárbara — Estadística de Residuos", 10, pageH - 6);

      pdf.save("estadisticas_desechos.pdf");
    } catch (err) {
      console.error(err);
      alert("No se pudo exportar el PDF. Intenta de nuevo.");
    }
  };

  // =========================================================
  // Exportar Excel (.xlsx) con 3 hojas
  // =========================================================
  const exportExcel = () => {
    try {
      // Hoja 1: Resumen
      const resumen = [["Tipo", "Kg", "%"]];
      labels.forEach((l, i) => resumen.push([l, valores[i], Number(porcentajes[i])]));
      resumen.push(["TOTAL", total, 100]);

      // Hoja 2: Áreas
      const areasRows = detalleAreas.map((row) => row);

      // Hoja 3: Mensual
      const mensualRows = mensual.map((r) => r);

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet(resumen);
      const ws2 = XLSX.utils.json_to_sheet(areasRows);
      const ws3 = XLSX.utils.json_to_sheet(mensualRows);

      // Anchos de columna
      ws1["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 8 }];
      ws2["!cols"] = [{ wch: 20 }, ...labels.map(() => ({ wch: 14 })), { wch: 12 }];
      ws3["!cols"] = [{ wch: 10 }, { wch: 10 }];

      XLSX.utils.book_append_sheet(wb, ws1, "Resumen");
      XLSX.utils.book_append_sheet(wb, ws2, "Áreas");
      XLSX.utils.book_append_sheet(wb, ws3, "Mensual");

      XLSX.writeFile(wb, "estadisticas_desechos.xlsx", { compression: true });
    } catch (e) {
      console.error(e);
      alert("No se pudo exportar el Excel.");
    }
  };

  // =========================================================
  // Modal de predicción (bonito)
  // =========================================================
  const [predOpen, setPredOpen] = useState(false);
  const [predData, setPredData] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setPredOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const verPrediccion = () => {
    const proy = [
      { nombre: "Infeccioso",    deltaPct: +10, kg: Math.round(valores[0] * 1.10), color: colores[0] },
      { nombre: "Común",         deltaPct:  -3, kg: Math.round(valores[1] * 0.97), color: colores[1] },
      { nombre: "Punzocortante", deltaPct:   0, kg: Math.round(valores[2] * 1.00), color: colores[2] },
      { nombre: "Patológico",    deltaPct:  +5, kg: Math.round(valores[3] * 1.05), color: colores[3] },
      { nombre: "Especiales",    deltaPct:   0, kg: Math.round(valores[4] * 1.00), color: colores[4] },
    ];
    const totalNext = proy.reduce((a, b) => a + b.kg, 0);
    setPredData({ proy, totalNext });
    setPredOpen(true);
  };

  const descargarCSVPrediccion = () => {
    if (!predData) return;
    const rows = [["Tipo", "Kg", "Δ%"]];
    predData.proy.forEach((p) => rows.push([p.nombre, p.kg, p.deltaPct]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prediccion_resumen.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================
  // Render
  // =========================================================
  return (
    <div className="estadisticas-container">
      <h2>📊 Estadísticas Generales</h2>

      <div ref={chartBoxRef} className="chart-box" aria-label="Distribución por tipo de desecho">
        <div style={{ position: "relative", height: 360 }}>
          <Doughnut data={chartData} options={chartOptions} />
          <CenterLabel />
        </div>

        {/* Resumen tabular (Kg y %) */}
        <div style={{ marginTop: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Tipo</th>
                <th style={{ padding: "8px 6px" }}>Kg</th>
                <th style={{ padding: "8px 6px" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l} style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
                  <td style={{ padding: "8px 6px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: colores[i],
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    {l}
                  </td>
                  <td style={{ padding: "8px 6px" }}>{valores[i]} kg</td>
                  <td style={{ padding: "8px 6px" }}>{porcentajes[i]}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid rgba(0,0,0,.12)", fontWeight: 700 }}>
                <td style={{ padding: "8px 6px" }}>TOTAL</td>
                <td style={{ padding: "8px 6px" }}>{total} kg</td>
                <td style={{ padding: "8px 6px" }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Detalle por áreas */}
        <div style={{ marginTop: 22 }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Detalle por áreas</h4>
          <div className="table-scroll">
            <table style={{ minWidth: 680, width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "8px 6px" }}>Área</th>
                  {labels.map((l) => (
                    <th key={l} style={{ padding: "8px 6px" }}>{l} (kg)</th>
                  ))}
                  <th style={{ padding: "8px 6px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {detalleAreas.map((r) => (
                  <tr key={r["Área"]} style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
                    <td style={{ padding: "8px 6px" }}>{r["Área"]}</td>
                    {labels.map((l) => (
                      <td key={l} style={{ padding: "8px 6px" }}>{r[l]}</td>
                    ))}
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{r.Total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <div className="botones-estadisticas">
        <button onClick={exportPDF}>Descargar PDF</button>
        <button onClick={exportExcel}>Descargar Excel</button>
        <button className="btn-predecir" onClick={verPrediccion}>Ver predicción</button>
      </div>

      {/* ===== Modal de predicción ===== */}
      {predOpen && predData && (
        <div className="modal-overlay" onClick={() => setPredOpen(false)} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span className="modal-icon">📈</span>
                Predicción para el próximo mes
              </div>
              <button className="modal-close" onClick={() => setPredOpen(false)} aria-label="Cerrar">✕</button>
            </div>

            <div className="modal-body">
              <ul className="pred-list">
                {predData.proy.map((item) => {
                  const sgn = item.deltaPct > 0 ? "+" : item.deltaPct < 0 ? "−" : "≈";
                  const badgeClass =
                    item.deltaPct > 0 ? "chip chip-up" : item.deltaPct < 0 ? "chip chip-down" : "chip chip-flat";
                  return (
                    <li key={item.nombre} className="pred-row">
                      <span className="dot" style={{ background: item.color }} />
                      <span className="pred-name">{item.nombre}</span>
                      <span className="pred-kg">{item.kg} kg</span>
                      <span className={badgeClass}>
                        {sgn}{Math.abs(item.deltaPct || 0)}{item.deltaPct !== 0 ? "%" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="pred-total">
                <div>Total estimado</div>
                <div className="pred-total-number">{predData.totalNext} kg</div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-outline" onClick={() => setPredOpen(false)}>Cerrar</button>
              <button className="btn-primary" onClick={descargarCSVPrediccion}>
                Descargar resumen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
