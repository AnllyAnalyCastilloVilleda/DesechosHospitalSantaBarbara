// src/reportes/ImpresionDiaria.js
import React, { useEffect, useState } from "react";
import { http as api } from "../config/api";
import "./ImpresionDiaria.css";

function fmt(n) {
  const v = Number(n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toFixed(2);
}

// Formatea sin desfase por zona horaria; soporta "YYYY-MM-DD" y "YYYY-MM-DDTHH:MM..."
function dmy(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`; // dd/mm/yyyy
  const d = new Date(iso); // fallback
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// Inserta soft-hyphen para títulos largos (evita “romper” bordes)
const hyphenateTitle = (t) =>
  String(t || "").replace(/Punzocortantes/gi, "Punzocor\u00ADtantes");

/**
 * ImpresiónDiaria
 * Props:
 *  - registroId?: number              -> si viene, imprime ese registro (por-registro)
 *  - fechaISO?: "YYYY-MM-DD"          -> si no hay registroId, imprime el diario por fecha
 *  - unidad: "lb" | "kg" (default "lb")
 *  - soloAreasConDatos: boolean (default false)
 *  - data?: objeto DTO completo        -> si viene, se renderiza sin pedir nada al backend
 */
export default function ImpresionDiaria({
  registroId,
  fechaISO,
  unidad = "lb",
  soloAreasConDatos = false,
  data,
}) {
  const [dto, setDto] = useState(data || null);
  const [loading, setLoading] = useState(!data);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancel = false;

    // Si ya nos pasaron el DTO listo, no hacemos fetch
    if (data) {
      setDto(data);
      setLoading(false);
      setErr("");
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setErr("");

        if (registroId) {
          // Reporte POR REGISTRO (la fecha la define el backend como apertura del registro)
          const { data: resp } = await api.get(`/reportes/desechos/por-registro/${registroId}`, {
            params: { unidad, soloAreasConDatos },
          });
          if (!cancel) setDto(resp);
        } else {
          // Reporte DIARIO por fecha
          const { data: resp } = await api.get("/reportes/desechos/diario", {
            params: { fecha: fechaISO, unidad, soloAreasConDatos },
          });
          if (!cancel) setDto(resp);
        }
      } catch (e) {
        if (!cancel) {
          const msg =
            e?.response?.data?.mensaje ||
            e?.message ||
            "No se pudo obtener el reporte.";
          setErr(msg);
          setDto(null);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [registroId, fechaISO, unidad, soloAreasConDatos, data]);

  if (loading) {
    return (
      <div className="rpt-wrap" lang="es" aria-busy="true">
        <div className="rpt-loading">Cargando reporte…</div>
      </div>
    );
  }
  if (err) {
    return (
      <div className="rpt-wrap" lang="es" role="alert">
        <div className="rpt-error">{err}</div>
      </div>
    );
  }
  if (!dto) return null;

  const {
    encabezado = {},
    columnas = [],
    filas = [],
    totales = [],
    firma = {},
    fecha,
    unidad: unidadSrv = unidad,
  } = dto;

  const showFecha =
    encabezado?.mostrarFecha === undefined ? true : !!encabezado.mostrarFecha;

  const unidadSub = unidadSrv === "kg" ? "Kilogramos" : "Libras";
  const hayFilas = Array.isArray(filas) && filas.length > 0;

  return (
    <div className="rpt-wrap" lang="es" data-print-ready="1">
      <header className="rpt-header">
        <div className="rpt-line rpt-line1">{encabezado.linea1 || ""}</div>
        <div className="rpt-line rpt-line2">{encabezado.linea2 || ""}</div>
        <div className="rpt-line rpt-line3">
          {encabezado.linea3 || "Control Diario de los Desechos Hospitalarios"}
        </div>
        {showFecha && (
          <div className="rpt-fecha">
            <b>Fecha:</b> {dmy(fecha)}
          </div>
        )}
      </header>

      <table className="rpt-table">
        <thead>
          <tr>
            <th className="area-col">Área</th>
            {columnas.map((c, i) => {
              const sub = c.subtitulo || unidadSub;
              return (
                <th key={`${c.id ?? "col"}-${i}`}>
                  <div className="title">{hyphenateTitle(c.titulo)}</div>
                  <div className="sub">{sub}</div>
                </th>
              );
            })}
            <th>Responsable</th>
            <th>Firma</th>
          </tr>
        </thead>

        <tbody>
          {hayFilas ? (
            filas.map((f, rIdx) => (
              <tr key={`${f.areaId ?? f.area ?? rIdx}`}>
                <td className="area-col">{f.area}</td>
                {columnas.map((c, i) => {
                  // Preferimos buscar por tipoId; si es null/undefined, caemos por índice
                  const byTipo =
                    f.valores?.find((x) => x.tipoId === c.id)?.valor;
                  const v =
                    byTipo ??
                    (Array.isArray(f.valores) ? f.valores[i]?.valor : 0) ??
                    0;
                  return (
                    <td key={`${c.id ?? "col"}-${i}`} className="num">
                      {fmt(v)}
                    </td>
                  );
                })}
                <td className="resp">{f.responsable || ""}</td>
                <td className="firma"></td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="area-col" colSpan={2 + columnas.length}>
                <em>No hay datos para la selección.</em>
              </td>
            </tr>
          )}
        </tbody>

        <tfoot>
          <tr>
            <td className="area-col">
              <b>Total:</b>
            </td>
            {columnas.map((c, i) => {
              // Igual que arriba: busca por tipoId o por índice como fallback
              const byTipo = totales.find((x) => x.tipoId === c.id)?.valor;
              const v =
                byTipo ?? (Array.isArray(totales) ? totales[i]?.valor : 0) ?? 0;
              return (
                <td key={`${c.id ?? "col"}-${i}`} className="num">
                  <b>{fmt(v)}</b>
                </td>
              );
            })}
            <td></td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div className="rpt-firma-block">
        <div className="rpt-firma-line"></div>
        <div className="rpt-firma-nombre">{firma?.nombre || ""}</div>
        <div className="rpt-firma-cargo">{firma?.cargo || ""}</div>
      </div>
    </div>
  );
}
