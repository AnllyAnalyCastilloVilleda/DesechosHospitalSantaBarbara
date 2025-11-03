const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/* Util: inicio/fin de día en local (sin arruinarse por UTC) */
function rangoDiaLocal(yyyy_mm_dd) {
  const [y, m, d] = yyyy_mm_dd.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end   = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { start, end };
}

// Convierte siempre a libras
function toLb(value, unidad = 'LB') {
  const v = Number(value || 0);
  if (!Number.isFinite(v)) return 0;
  return unidad?.toUpperCase() === 'KG' ? v * 2.20462 : v;
}

/**
 * Suma por área y tipo (INF, PAT, PUNZ, ESP, COMÚN) para una fecha dada.
 * Asume tablas: Registro (fecha/hora), RegistroDetalle (areaId,tipoId,peso,unidad),
 * Area, TipoDesecho.
 */
async function impresionDiaria({ fecha }) {
  const { start, end } = rangoDiaLocal(fecha);

  // Trae todos los detalles del día (solo los cerrados si así lo manejas)
  const detalles = await prisma.registroDetalle.findMany({
    where: {
      registro: {
        fechaHora: { gte: start, lte: end },
        // cerrado: true,   // ← descomenta si solo quieres los cerrados
      },
    },
    select: {
      peso: true,
      unidad: true,           // 'KG' o 'LB'
      area: { select: { id: true, nombre: true } },
      tipo: { select: { id: true, codigo: true, nombre: true } }, // codigo ej: INF, PAT, PUNZ, ESP, COM
    },
  });

  // Catálogo de áreas visibles en el reporte (por orden)
  const areas = await prisma.area.findMany({
    orderBy: { orden: 'asc' }, // usa el campo que tengas; si no, por nombre
    select: { id: true, nombre: true },
  });

  // Mapa acumulador: areaId -> { nombre, INF, PAT, PUNZ, ESP, COM }
  const acc = new Map();
  areas.forEach(a => {
    acc.set(a.id, { 
      areaId: a.id, areaNombre: a.nombre,
      INF: 0, PAT: 0, PUNZ: 0, ESP: 0, COM: 0
    });
  });

  for (const row of detalles) {
    const a = acc.get(row.area?.id) || acc.set(row.area?.id, {
      areaId: row.area?.id,
      areaNombre: row.area?.nombre || '—',
      INF: 0, PAT: 0, PUNZ: 0, ESP: 0, COM: 0
    }).get(row.area?.id);

    const lb = toLb(row.peso, row.unidad);
    const code = (row.tipo?.codigo || '').toUpperCase(); // espera INF/PAT/PUNZ/ESP/COM
    if (code === 'INF') a.INF += lb;
    else if (code === 'PAT') a.PAT += lb;
    else if (code === 'PUNZ' || code === 'PUNZOCORT') a.PUNZ += lb;
    else if (code === 'ESP' || code === 'ESPECIALES') a.ESP += lb;
    else a.COM += lb; // por defecto a común
  }

  // Ordena como el catálogo original
  const filas = areas.map(a => acc.get(a.id));

  // Totales finales
  const totales = filas.reduce((t, f) => ({
    INF: t.INF + f.INF,
    PAT: t.PAT + f.PAT,
    PUNZ: t.PUNZ + f.PUNZ,
    ESP: t.ESP + f.ESP,
    COM: t.COM + f.COM,
  }), { INF:0, PAT:0, PUNZ:0, ESP:0, COM:0 });

  // Redondeo a 2 decimales para impresión
  const round2 = x => Math.round(x * 100) / 100;

  return {
    fecha,
    filas: filas.map(f => ({
      ...f,
      INF: round2(f.INF), PAT: round2(f.PAT), PUNZ: round2(f.PUNZ),
      ESP: round2(f.ESP), COM: round2(f.COM),
    })),
    totales: Object.fromEntries(Object.entries(totales).map(([k,v]) => [k, round2(v)])),
  };
}

module.exports = { impresionDiaria };
