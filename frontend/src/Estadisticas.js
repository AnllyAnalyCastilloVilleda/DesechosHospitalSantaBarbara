// src/Estadisticas.js
import React, { useRef } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./Estadisticas.css";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Estadisticas() {
  const chartBoxRef = useRef(null);

  const data = {
    labels: ["Infeccioso", "Común", "Punzocortante", "Patológico", "Especiales"],
    datasets: [
      {
        label: "Cantidad (kg)",
        data: [40, 25, 15, 30, 20],
        backgroundColor: ["#ff6384", "#36a2eb", "#ffcd56", "#4bc0c0", "#a167e7"],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
  };

  const exportPDF = async () => {
    try {
      const input = chartBoxRef.current;
      if (!input) return;

      const canvas = await html2canvas(input);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, "PNG", 0, 10, pdfWidth, pdfHeight);
      pdf.save("estadisticas_desechos.pdf");
    } catch (err) {
      console.error(err);
      alert("No se pudo exportar el PDF. Intenta de nuevo.");
    }
  };

  const predecirEstadisticas = () => {
    alert(
      "📈 Predicción simulada: Se espera un aumento del 10% en desechos infecciosos el próximo mes."
    );
  };

  return (
    <div className="estadisticas-container">
      <h2>📊 Estadísticas Generales</h2>

      <div ref={chartBoxRef} className="grafico-box">
        <h3>Distribución por tipo de desecho</h3>
        <div className="grafico-wrapper" role="img" aria-label="Gráfico de pastel de distribución por tipo de desecho">
          <Pie data={data} options={options} />
        </div>
      </div>

      <div className="botones-estadisticas">
        <button className="btn-guardar" onClick={exportPDF}>
          Guardar como PDF
        </button>
        <button className="btn-predecir" onClick={predecirEstadisticas}>
          Predecir estadísticas futuras
        </button>
      </div>
    </div>
  );
}
