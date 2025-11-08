// src/Estadisticas.js
import React, { useMemo, useRef } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./Estadisticas.css";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Estadisticas() {
  const chartBoxRef = useRef(null);

  // Datos base (puedes reemplazar por props o estado)
  const labels = ["Infeccioso", "Común", "Punzocortante", "Patológico", "Especiales"];
  const valores = [40, 25, 15, 30, 20];

  // Total y % por categoría (para etiqueta central y tooltip)
  const total = useMemo(() => valores.reduce((a, b) => a + b, 0), [valores]);
  const porcentajes = useMemo(
    () => valores.map((v) => (total ? ((v / total) * 100).toFixed(1) : 0)),
    [valores, total]
  );

  // Dataset Chart.js (anillo con "cutout")
  const data = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: "Cantidad (kg)",
          data: valores,
          backgroundColor: ["#ff6384", "#36a2eb", "#ffcd56", "#4bc0c0", "#a167e7"],
          borderColor: "rgba(0,0,0,.08)",
          borderWidth: 1,
          hoverOffset: 8,
        },
      ],
    }),
    [labels, valores]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 8 },
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
              const p = porcentajes[i];
              return ` ${labels[i]}: ${v} kg (${p}%)`;
            },
          },
        },
      },
      elements: { arc: { borderJoinStyle: "round" } },
      cutout: "60%",
    }),
    [labels, porcentajes]
  );

  // Renderizamos el número total dentro del anillo
  const CenterLabel = () => (
    <div className="center-label" aria-hidden="true">
      <div className="center-total">{total} kg</div>
      <div className="center-sub">Total 12 meses</div>
    </div>
  );

  // Exportación a PDF (A4 alta calidad, adapta el canvas al ancho de página)
  const exportPDF = async () => {
    try {
      const input = chartBoxRef.current;
      if (!input) return;

      const canvas = await html2canvas(input, {
        backgroundColor: "#ffffff",
        scale: 2, // mejora nitidez
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = pageWidth - 20; // márgenes
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      const y = 12;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text("Estadísticas Generales — Distribución por tipo de desecho", 10, 10);

      pdf.addImage(imgData, "PNG", 10, y + 2, imgWidth, Math.min(imgHeight, pageHeight - y - 10));
      pdf.save("estadisticas_desechos.pdf");
    } catch (err) {
      console.error(err);
      alert("No se pudo exportar el PDF. Intenta de nuevo.");
    }
  };

  // Exportación CSV simple (labels, kg, %)
  const exportCSV = () => {
    try {
      const rows = [["Tipo", "Kg", "Porcentaje"]];
      labels.forEach((l, i) => rows.push([l, String(valores[i]), `${porcentajes[i]}%`]));
      rows.push(["TOTAL", String(total), "100%"]);

      const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "estadisticas_desechos.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("No se pudo exportar el CSV.");
    }
  };

  // Predicción simulada con un pequeño cálculo en vez de solo alerta fija
  const predecirEstadisticas = () => {
    // Regla visual: +10% infeccioso, +5% patológico, -3% común, resto estable
    const proy = {
      Infeccioso: Math.round(valores[0] * 1.10),
      Común: Math.round(valores[1] * 0.97),
      Punzocortante: Math.round(valores[2] * 1.00),
      Patológico: Math.round(valores[3] * 1.05),
      Especiales: Math.round(valores[4] * 1.00),
    };
    const totalNext = Object.values(proy).reduce((a, b) => a + b, 0);
    const msg = [
      "📈 Predicción simulada (próximo mes):",
      `• Infeccioso: ${proy.Infeccioso} kg (+10%)`,
      `• Común: ${proy.Común} kg (−3%)`,
      `• Punzocortante: ${proy.Punzocortante} kg (≈)`,
      `• Patológico: ${proy.Patológico} kg (+5%)`,
      `• Especiales: ${proy.Especiales} kg (≈)`,
      `Total estimado: ${totalNext} kg`,
    ].join("\n");
    alert(msg);
  };

  return (
    <div className="estadisticas-container">
      <header className="estadisticas-header">
        <h2>📊 Estadísticas Generales</h2>
        <p className="sub">
          Vista ilustrativa 100% frontend. Puedes reemplazar los datos por valores reales cuando el backend esté listo.
        </p>
      </header>

      <section
        ref={chartBoxRef}
        className="grafico-box"
        aria-label="Sección del gráfico de distribución por tipo de desecho"
      >
        <h3>Distribución por tipo de desecho</h3>
        <div
          className="grafico-wrapper"
          role="img"
          aria-label="Gráfico de anillo de distribución por tipo de desecho"
        >
          <Pie data={data} options={options} />
          <CenterLabel />
        </div>

        <div className="resumen">
          {labels.map((l, i) => (
            <div className="resumen-item" key={l}>
              <span className="resumen-color" style={{ background: data.datasets[0].backgroundColor[i] }} />
              <span className="resumen-label">{l}</span>
              <span className="resumen-value">{valores[i]} kg</span>
              <span className="resumen-pct">{porcentajes[i]}%</span>
            </div>
          ))}
          <div className="resumen-item total">
            <span className="resumen-label">TOTAL</span>
            <span className="resumen-value">{total} kg</span>
            <span className="resumen-pct">100%</span>
          </div>
        </div>
      </section>

      <div className="botones-estadisticas">
        <button className="btn-guardar" onClick={exportPDF}>
          Guardar como PDF
        </button>
        <button className="btn-predecir" onClick={predecirEstadisticas}>
          Predecir estadísticas futuras
        </button>
        <button className="btn-csv" onClick={exportCSV}>
          Exportar CSV
        </button>
      </div>
    </div>
  );
}
