// src/routes/reportes.desechos.js
"use strict";

module.exports = function reportesDesechosRoutes(prisma, { auth, requirePerm }) {
  const router = require("express").Router();

  const ESTADO_CERRADO = "CERRADO";
  const LB_POR_KG = 2.20462262185;

  // Orden de columnas como en el formato físico
  const COLUMN_ORDER = [
    "Desechos Infecciosos",
    "Desechos Patológicos",
    "Desechos Punzocortantes",
    "Desechos Especiales",
    "Desecho Común",
  ];

  // Orden de áreas como en la hoja impresa
  const AREA_ORDER = [
    "Medicina, Cirugía y Trauma Hombres y Mujeres, Rayos X",
    "Pediatría y Maternidad",
    "Consulta Externa",
    "Emergencia, costurería, psicología, despacho de farmacia, laboratorio, fisioterapia, trabajo social, transporte",
    "Intensivo",
    "Quirófano",
    "Sala de Partos",
    "Central de Equipo",
    "Cocina",
    "Lavandería",
    "Mantenimiento",
    "Intendencia",
    "Administración",
    "Área Verde",
    "Bodegas",
    "Gerencia",
  ];

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();

  const asBool = (v, def = false) => {
    if (v == null) return def;
    const s = String(v).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "si";
  };

  const ymdUTC = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Conversión unidades
  const toUnidad = (lb, unidad) => {
    const n = Number(lb || 0);
    if (unidad === "kg") return Number((n / LB_POR_KG).toFixed(2));
    return Number(n.toFixed(2));
  };

  /* =======================
     Resolver robusto de Tipos
     ======================= */
  const TIPO_SYNONYMS = {
    [norm("Desechos Infecciosos")]: [
      "infeccioso","infecciosos","desechos infecciosos","residuos infecciosos","bioinfeccioso","bioinfecciosos","inf"
    ],
    [norm("Desechos Patológicos")]: [
      "patologico","patologicos","patológicos","anatomopatologico","anatomopatologicos","anat","pat"
    ],
    [norm("Desechos Punzocortantes")]: [
      "punzocortante","punzocortantes","cortopunzante","cortopunzantes","corto punzantes","corto-punzantes","punz","punzo"
    ],
    [norm("Desechos Especiales")]: [
      "especial","especiales","quimico","quimicos","farmaceutico","farmaceuticos","esp"
    ],
    [norm("Desecho Común")]: [
      "comun","común","ordinario","no peligroso","domiciliario","com"
    ],
  };

  function resolveTipoId(tiposDB, tituloEsperado) {
    const esperado = norm(tituloEsperado);

    const byName = new Map(tiposDB.map((t) => [norm(t.nombre), t]));
    // Si el modelo no trae codigo/clave/slug, este mapa quedará vacío y no pasa nada.
    const byCode = new Map(
      tiposDB
        .filter((t) => t.codigo || t.clave || t.slug)
        .map((t) => [norm(t.codigo || t.clave || t.slug), t])
    );

    if (byName.has(esperado)) return byName.get(esperado).id;

    const CODE_ALIAS = {
      [norm("Desechos Infecciosos")]: ["inf","infeccioso","infecciosos"],
      [norm("Desechos Patológicos")]: ["pat","anat","anatomopatologicos"],
      [norm("Desechos Punzocortantes")]: ["punz","punzo","cortopunzantes"],
      [norm("Desechos Especiales")]: ["esp","especiales"],
      [norm("Desecho Común")]: ["com","comun","ordinario","no peligroso"],
    };
    const codes = CODE_ALIAS[esperado] || [];
    for (const c of codes) {
      if (byCode.has(norm(c))) return byCode.get(norm(c)).id;
      if (byName.has(norm(c))) return byName.get(norm(c)).id;
    }

    const synonyms = TIPO_SYNONYMS[esperado] || [];
    for (const t of tiposDB) {
      const n = norm(t.nombre);
      if (synonyms.some((kw) => n.includes(norm(kw)))) return t.id;
      if (t.codigo && synonyms.some((kw) => norm(t.codigo).includes(norm(kw)))) return t.id;
      if (t.clave  && synonyms.some((kw) => norm(t.clave ).includes(norm(kw)))) return t.id;
      if (t.slug   && synonyms.some((kw) => norm(t.slug  ).includes(norm(kw)))) return t.id;
    }
    return null;
  }

  // ========= REPORTE POR REGISTRO =========
  router.get(
    "/desechos/por-registro/:id",
    auth,
    requirePerm("REGISTRO_DIARIO"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ mensaje: "registroId inválido" });
        }
        const unidad = String(req.query.unidad || "lb").toLowerCase();
        const soloAreasConDatos = asBool(req.query.soloAreasConDatos, false);
        if (!["lb","kg"].includes(unidad)) {
          return res.status(400).json({ mensaje: "Parámetro unidad inválido (lb | kg)" });
        }

        const reg = await prisma.registro.findUnique({
          where: { id },
          select: {
            id: true,
            estado: true,
            abiertoAt: true,
            cerradoAt: true,
            creadoPor: { select: { nombre: true, usuario: true } },
          },
        });
        if (!reg) return res.status(404).json({ mensaje: "Registro no encontrado" });

        // ⬇️ SOLO id y nombre (seguros en cualquier schema)
        const [areasDB, tiposDB] = await Promise.all([
          prisma.area.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
          prisma.tipoDesecho.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
        ]);

        const areaByName = new Map(areasDB.map((a) => [norm(a.nombre), a]));
        const areas = AREA_ORDER.map((label) => {
          const found = areaByName.get(norm(label));
          return found ? { id: found.id, label } : { id: null, label };
        });

        const columnas = COLUMN_ORDER.map((titulo) => {
          const tipoId = resolveTipoId(tiposDB, titulo);
          return { id: tipoId, titulo, subtitulo: unidad === "kg" ? "Kilogramos" : "Libras" };
        });

        const grupos = await prisma.registroLinea.groupBy({
          by: ["areaId", "tipoDesechoId"],
          where: { registroId: id },
          _sum: { pesoLb: true },
        });

        const agg = new Map();
        for (const g of grupos) {
          if (!g.areaId || !g.tipoDesechoId) continue;
          const key = `${g.areaId}:${g.tipoDesechoId}`;
          const v = Number(g._sum.pesoLb || 0);
          if (!Number.isFinite(v)) continue;
          agg.set(key, (agg.get(key) || 0) + v);
        }

        const responsableGlobal = reg.creadoPor?.nombre || reg.creadoPor?.usuario || "";

        const filas = [];
        for (const a of areas) {
          const valores = [];
          let tieneDatos = false;
          for (const col of columnas) {
            let lb = 0;
            if (a.id && col.id) lb = agg.get(`${a.id}:${col.id}`) || 0;
            const val = toUnidad(lb, unidad);
            if (val > 0) tieneDatos = true;
            valores.push({ tipoId: col.id, valor: val });
          }
          if (soloAreasConDatos && !tieneDatos) continue;
          filas.push({ areaId: a.id, area: a.label, valores, responsable: responsableGlobal });
        }

        const totales = columnas.map((col) => {
          let sumLb = 0;
          if (col.id) {
            for (const a of areas) {
              if (!a.id) continue;
              sumLb += agg.get(`${a.id}:${col.id}`) || 0;
            }
          }
          return { tipoId: col.id, valor: toUnidad(sumLb, unidad) };
        });

        res.json({
          registroId: reg.id,
          estado: reg.estado,
          unidad,
          meta: {
            generadoEnUTC: new Date().toISOString(),
            factorLbPorKg: LB_POR_KG,
            rango: {
              desdeUTC: reg.abiertoAt ? reg.abiertoAt.toISOString() : null,
              hastaUTC: reg.cerradoAt ? reg.cerradoAt.toISOString() : null,
            },
            criterio: "Suma únicamente las líneas pertenecientes al registro indicado (independiente de la fecha).",
          },
          encabezado: {
            linea1: "Hospital Santa Bárbara",
            linea2: "Colonia Santa Bárbara Morales, Izabal",
            linea3: "Control Diario de los Desechos Hospitalarios",
            mostrarFecha: true,
            fecha: reg.abiertoAt ? ymdUTC(reg.abiertoAt) : ymdUTC(new Date()),
          },
          columnas,
          filas,
          totales,
          firma: { nombre: "Robert Leonardo Duarte", cargo: "Encargado de Intendencia" },
        });
      } catch (err) {
        console.error("Error /reportes/desechos/por-registro/:id:", err);
        res.status(500).json({ mensaje: "Error generando reporte" });
      }
    }
  );

  // ========= REPORTE POR DÍA / RANGO =========
  router.get(
    "/desechos/diario",
    auth,
    requirePerm("REGISTRO_DIARIO"),
    async (req, res) => {
      try {
        const hasRango = req.query.desde || req.query.hasta;
        let start, end, etiqueta;
        if (hasRango) {
          const desde = String(req.query.desde || "").trim();
          const hasta = String(req.query.hasta || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
            return res.status(400).json({ mensaje: "Parámetros desde/hasta inválidos" });
          }
          start = new Date(`${desde}T00:00:00.000Z`);
          end = new Date(`${hasta}T00:00:00.000Z`);
          end.setUTCDate(end.getUTCDate() + 1);
          etiqueta = `${desde} a ${hasta}`;
        } else {
          let fecha = String(req.query.fecha || "").trim();
          if (!fecha) fecha = ymdUTC(new Date());
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return res.status(400).json({ mensaje: "Parámetro fecha inválido (YYYY-MM-DD)" });
          }
          start = new Date(`${fecha}T00:00:00.000Z`);
          end = new Date(`${fecha}T00:00:00.000Z`);
          end.setUTCDate(end.getUTCDate() + 1);
          etiqueta = fecha;
        }

        const unidad = String(req.query.unidad || "lb").toLowerCase();
        const soloAreasConDatos = asBool(req.query.soloAreasConDatos, false);
        if (!["lb","kg"].includes(unidad)) {
          return res.status(400).json({ mensaje: "Parámetro unidad inválido (lb | kg)" });
        }

        const [areasDB, tiposDB] = await Promise.all([
          prisma.area.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
          prisma.tipoDesecho.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
        ]);

        const areaByName = new Map(areasDB.map((a) => [norm(a.nombre), a]));
        const areas = AREA_ORDER.map((label) => {
          const found = areaByName.get(norm(label));
          return found ? { id: found.id, label } : { id: null, label };
        });

        const tipoByName = new Map(tiposDB.map((t) => [norm(t.nombre), t]));
        const columnas = COLUMN_ORDER.map((titulo) => {
          const t = tipoByName.get(norm(titulo));
          return { id: t ? t.id : null, titulo, subtitulo: unidad === "kg" ? "Kilogramos" : "Libras" };
        });

        const grupos = await prisma.registroLinea.groupBy({
          by: ["areaId", "tipoDesechoId"],
          where: {
            registro: { abiertoAt: { gte: start, lt: end }, estado: ESTADO_CERRADO },
          },
          _sum: { pesoLb: true },
        });

        const agg = new Map();
        for (const g of grupos) {
          const key = `${g.areaId}:${g.tipoDesechoId}`;
          const v = Number(g._sum.pesoLb || 0);
          agg.set(key, (agg.get(key) || 0) + v);
        }

        const lineas = await prisma.registroLinea.findMany({
          where: { registro: { abiertoAt: { gte: start, lt: end }, estado: ESTADO_CERRADO } },
          select: {
            areaId: true,
            registro: { select: { abiertoAt: true, creadoPor: { select: { nombre: true, usuario: true } } } },
          },
          orderBy: [{ registro: { abiertoAt: "desc" } }],
          take: 20000,
        });
        const respPorArea = new Map();
        for (const ln of lineas) {
          if (ln.areaId && !respPorArea.has(ln.areaId)) {
            const r = ln.registro?.creadoPor;
            respPorArea.set(ln.areaId, r?.nombre || r?.usuario || "");
          }
        }

        const filas = [];
        for (const a of areas) {
          const valores = [];
          let tieneDatos = false;
          for (const col of columnas) {
            let lb = 0;
            if (a.id && col.id) lb = agg.get(`${a.id}:${col.id}`) || 0;
            const val = toUnidad(lb, unidad);
            if (val > 0) tieneDatos = true;
            valores.push({ tipoId: col.id, valor: val });
          }
          if (soloAreasConDatos && !tieneDatos) continue;
          const responsable = a.id && respPorArea.has(a.id) ? respPorArea.get(a.id) : "";
          filas.push({ areaId: a.id, area: a.label, valores, responsable });
        }

        const totales = columnas.map((col) => {
          let sumLb = 0;
          if (col.id) {
            for (const a of areas) {
              if (!a.id) continue;
              sumLb += agg.get(`${a.id}:${col.id}`) || 0;
            }
          }
          return { tipoId: col.id, valor: toUnidad(sumLb, unidad) };
        });

        res.json({
          fecha: etiqueta,
          unidad,
          meta: {
            generadoEnUTC: new Date().toISOString(),
            factorLbPorKg: LB_POR_KG,
            soloAreasConDatos,
            criterio: "Incluye únicamente registros CERRADOS dentro del rango indicado.",
          },
          encabezado: {
            linea1: "Hospital Santa Bárbara",
            linea2: "Colonia Santa Bárbara Morales, Izabal",
            linea3: "Control Diario de los Desechos Hospitalarios",
            mostrarFecha: true,
          },
          columnas,
          filas,
          totales,
          firma: { nombre: "Robert Leonardo Duarte", cargo: "Encargado de Intendencia" },
        });
      } catch (err) {
        console.error("Error /reportes/desechos/diario:", err);
        res.status(500).json({ mensaje: "Error generando reporte" });
      }
    }
  );

  return router;
};
