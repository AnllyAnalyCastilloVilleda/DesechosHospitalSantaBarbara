// src/routes/bolsas.routes.js
const express = require("express");

/** Normaliza booleanos desde querystring: "true"/"1" -> true, "false"/"0" -> false */
function parseBool(v) {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  return undefined;
}

/** Normaliza texto (trim) o null */
function textOrNull(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/** Int estricto positivo o null si no aplica */
function intOrNull(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

module.exports = function bolsasRoutes(prisma, { auth, requirePerm }) {
  const router = express.Router();

  /**
   * GET /bolsas
   * q: filtro de texto (color/tamano/descripcion/tipo.nombre)
   * activos=true|false|1|0 (filtra por estado)
   * tipoDesechoId (opcional)
   * page, pageSize (opcionales; si no vienen, devuelve lista simple)
   */
  router.get("/", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const { q, page, pageSize } = req.query;
      const activos = parseBool(req.query.activos);
      const tipoDesechoId = intOrNull(req.query.tipoDesechoId);

      const where = {};
      if (typeof activos === "boolean") where.estado = activos;
      if (tipoDesechoId) where.tipoDesechoId = tipoDesechoId;

      if (q && String(q).trim()) {
        const term = String(q).trim();
        where.OR = [
          { color: { contains: term, mode: "insensitive" } },
          { tamano: { contains: term, mode: "insensitive" } },
          { descripcion: { contains: term, mode: "insensitive" } },
          // Buscar por nombre del tipo también:
          { tipoDesecho: { nombre: { contains: term, mode: "insensitive" } } },
        ];
      }

      const commonSelect = {
        id: true,
        color: true,
        tamano: true,
        descripcion: true,
        estado: true,
        tipoDesechoId: true,
        tipoDesecho: { select: { id: true, nombre: true } },
      };

      // Paginado opcional
      if (page && pageSize) {
        const p = Math.max(1, Number(page) || 1);
        const ps = Math.max(1, Math.min(200, Number(pageSize) || 10));

        const [total, items] = await Promise.all([
          prisma.bolsa.count({ where }),
          prisma.bolsa.findMany({
            where,
            orderBy: [{ color: "asc" }, { tamano: "asc" }],
            skip: (p - 1) * ps,
            take: ps,
            select: commonSelect,
          }),
        ]);

        return res.json({ page: p, pageSize: ps, total, items });
      }

      // Sin paginar
      const rows = await prisma.bolsa.findMany({
        where,
        orderBy: [{ color: "asc" }, { tamano: "asc" }],
        select: commonSelect,
      });
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error listando bolsas" });
    }
  });

  /**
   * GET /bolsas/:id
   */
  router.get("/:id", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: "ID inválido" });
      }

      const row = await prisma.bolsa.findUnique({
        where: { id },
        select: {
          id: true,
          color: true,
          tamano: true,
          descripcion: true,
          estado: true,
          tipoDesechoId: true,
          tipoDesecho: { select: { id: true, nombre: true } },
          creadoPor: { select: { id: true, nombre: true, usuario: true } },
          creadoEn: true,
          actualizadoEn: true,
        },
      });

      if (!row) return res.status(404).json({ mensaje: "Bolsa no encontrada" });
      res.json(row);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error obteniendo bolsa" });
    }
  });

  /**
   * POST /bolsas
   * Requiere: color, tamano, tipoDesechoId
   */
  router.post("/", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const { color, tamano, descripcion = null, estado = true, tipoDesechoId } = req.body || {};

      const colorOk = textOrNull(color);
      const tamanoOk = textOrNull(tamano);
      const tipoId = intOrNull(tipoDesechoId);

      if (!colorOk || !tamanoOk) {
        return res.status(400).json({ mensaje: "color y tamaño son requeridos" });
      }
      if (!tipoId) {
        return res.status(400).json({ mensaje: "tipoDesechoId es requerido" });
      }

      // Validar existencia del tipo
      const tipo = await prisma.tipoDesecho.findUnique({ where: { id: tipoId } });
      if (!tipo) {
        return res.status(400).json({ mensaje: "El tipo de desecho no existe" });
      }

      const data = {
        color: colorOk,
        tamano: tamanoOk,
        descripcion: textOrNull(descripcion),
        estado: Boolean(estado),
        tipoDesechoId: tipoId,
        creadoPorId: req.user.id,
      };

      const row = await prisma.bolsa.create({ data });
      res.status(201).json(row);
    } catch (e) {
      if (e?.code === "P2002") {
        return res.status(409).json({ mensaje: "Ya existe una bolsa con ese color+tamaño" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error creando bolsa" });
    }
  });

  /**
   * PATCH /bolsas/:id
   */
  router.patch("/:id", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: "ID inválido" });
      }

      const { color, tamano, descripcion, estado, tipoDesechoId } = req.body || {};
      const data = {};

      if (typeof color === "string") {
        const v = textOrNull(color);
        if (!v) return res.status(400).json({ mensaje: "color no puede ser vacío" });
        data.color = v;
      }
      if (typeof tamano === "string") {
        const v = textOrNull(tamano);
        if (!v) return res.status(400).json({ mensaje: "tamaño no puede ser vacío" });
        data.tamano = v;
      }
      if (typeof descripcion !== "undefined") data.descripcion = textOrNull(descripcion);
      if (typeof estado === "boolean") data.estado = estado;

      if (typeof tipoDesechoId !== "undefined") {
        const tipoId = intOrNull(tipoDesechoId);
        if (!tipoId) {
          return res.status(400).json({ mensaje: "tipoDesechoId inválido" });
        }
        const tipo = await prisma.tipoDesecho.findUnique({ where: { id: tipoId } });
        if (!tipo) return res.status(400).json({ mensaje: "El tipo de desecho no existe" });
        data.tipoDesechoId = tipoId;
      }

      const upd = await prisma.bolsa.update({ where: { id }, data });
      res.json(upd);
    } catch (e) {
      if (e?.code === "P2002") {
        return res.status(409).json({ mensaje: "Ya existe una bolsa con ese color+tamaño" });
      }
      if (e?.code === "P2025") {
        return res.status(404).json({ mensaje: "Bolsa no encontrada" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error actualizando bolsa" });
    }
  });

  /**
   * PATCH /bolsas/:id/enable
   */
  router.patch("/:id/enable", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: "ID inválido" });
      }
      const upd = await prisma.bolsa.update({ where: { id }, data: { estado: true } });
      res.json(upd);
    } catch (e) {
      if (e?.code === "P2025") {
        return res.status(404).json({ mensaje: "Bolsa no encontrada" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error habilitando bolsa" });
    }
  });

  /**
   * PATCH /bolsas/:id/disable
   */
  router.patch("/:id/disable", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: "ID inválido" });
      }
      const upd = await prisma.bolsa.update({ where: { id }, data: { estado: false } });
      res.json(upd);
    } catch (e) {
      if (e?.code === "P2025") {
        return res.status(404).json({ mensaje: "Bolsa no encontrada" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error deshabilitando bolsa" });
    }
  });

  /**
   * DELETE /bolsas/:id
   */
  router.delete("/:id", auth, requirePerm("BOLSAS"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ mensaje: "ID inválido" });
      }

      // Si existen referencias, el FK lanzará P2003; puedes contar antes para mensaje más claro:
      // const refs = await prisma.loteQR.count({ where: { bolsaId: id } });
      // if (refs > 0) return res.status(400).json({ mensaje: "No se puede eliminar: hay lotes/etiquetas/registros asociados" });

      await prisma.bolsa.delete({ where: { id } });
      res.status(204).send();
    } catch (e) {
      if (e?.code === "P2003") {
        return res.status(400).json({ mensaje: "No se puede eliminar: hay referencias (lotes/etiquetas/registros)" });
      }
      if (e?.code === "P2025") {
        return res.status(404).json({ mensaje: "Bolsa no encontrada" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error eliminando bolsa" });
    }
  });

  return router;
};
