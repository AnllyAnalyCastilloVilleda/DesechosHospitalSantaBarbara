// src/routes/dashboard.routes.js
const express = require("express");
const router = express.Router();

// --- Usa Prisma (ajusta si ya tienes un cliente compartido) ---
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Calcula rango de semana (LUN → DOM) en la zona local del servidor.
 */
function weekRange(now = new Date()) {
  const d = new Date(now);
  // normaliza a 00:00:00
  d.setHours(0, 0, 0, 0);

  // getDay(): 0=Dom ... 6=Sáb. Queremos que Lunes sea inicio.
  const day = d.getDay(); // 0..6
  const diffToMonday = (day === 0 ? -6 : 1 - day);

  const from = new Date(d);
  from.setDate(d.getDate() + diffToMonday); // lunes 00:00

  const to = new Date(from);
  to.setDate(from.getDate() + 6);
  to.setHours(23, 59, 59, 999); // domingo 23:59:59.999

  return { from, to };
}

/**
 * GET /api/dashboard/kpis
 * Devuelve:
 *  - bolsasTotal: total de bolsas registradas (conteo de registros)
 *  - lbSemana: suma de libras recolectadas en la semana actual (lun-dom)
 *  - areasActivas: número de áreas activas
 */
router.get("/kpis", async (req, res) => {
  try {
    const { from, to } = weekRange(new Date());

    // TODO: Ajusta los nombres de modelo/campos a tu esquema Prisma:
    // - prisma.registro.count()
    // - prisma.registro.aggregate({_sum:{pesoLb:true}, where:{createdAt:{gte:from,lte:to}}})
    // - prisma.area.count({ where: { activa: true } })

    const [bolsasTotal, lbSemanaAgg, areasActivas] = await Promise.all([
      prisma.registro.count(), // TODO modelo real de "registros de bolsas"
      prisma.registro.aggregate({
        _sum: { pesoLb: true }, // TODO campo real de peso en libras
        where: { createdAt: { gte: from, lte: to } }, // TODO campo fecha real
      }),
      prisma.area.count({ where: { activa: true } }), // TODO campo estado real
    ]);

    res.json({
      bolsasTotal,
      lbSemana: Number(lbSemanaAgg?._sum?.pesoLb || 0),
      areasActivas,
    });
  } catch (err) {
    console.error("KPIs error:", err);
    res.json({ bolsasTotal: 0, lbSemana: 0, areasActivas: 0 });
  }
});

module.exports = router;