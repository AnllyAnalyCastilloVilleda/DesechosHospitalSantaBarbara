// src/routes/tiposDesecho.routes.js
const { Router } = require("express");

function normalizeText(v) {
  if (typeof v !== "string") return "";
  return v.trim();
}

module.exports = function tiposDesechoRoutes(prisma, { auth, requirePerm }) {
  const router = Router();

  /**
   * GET /tipos-desecho
   * q: texto de búsqueda (nombre/descripcion)
   * estado: activos | deshabilitados | eliminados   (default: activos)
   * page, pageSize (opcionales; si no vienen, devuelve lista completa)
   */
  router.get("/", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const q = normalizeText(req.query.q || "");
      const estadoParam = String(req.query.estado || "activos").toLowerCase();
      const wantDisabled =
        estadoParam === "deshabilitados" || estadoParam === "eliminados";

      const where = {
        estado: wantDisabled ? false : true,
      };

      if (q) {
        where.OR = [
          { nombre: { contains: q, mode: "insensitive" } },
          { descripcion: { contains: q, mode: "insensitive" } },
        ];
      }

      const page = Number(req.query.page || 0);
      const pageSize = Number(req.query.pageSize || 0);

      const commonSelect = {
        id: true,
        nombre: true,
        descripcion: true,
        estado: true,
        creadoPor: { select: { id: true, nombre: true, usuario: true } },
        _count: { select: { bolsas: true } },
      };

      // Paginado opcional
      if (page && pageSize) {
        const p = Math.max(1, page);
        const ps = Math.max(1, Math.min(200, pageSize));

        const [total, items] = await Promise.all([
          prisma.tipoDesecho.count({ where }),
          prisma.tipoDesecho.findMany({
            where,
            orderBy: [{ nombre: "asc" }],
            skip: (p - 1) * ps,
            take: ps,
            select: commonSelect,
          }),
        ]);

        return res.json({ page: p, pageSize: ps, total, items });
      }

      // Sin paginar
      const rows = await prisma.tipoDesecho.findMany({
        where,
        orderBy: [{ nombre: "asc" }],
        select: commonSelect,
      });
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /**
   * GET /tipos-desecho/:id
   */
  router.get("/:id", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = await prisma.tipoDesecho.findUnique({
        where: { id },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          estado: true,
          creadoPor: { select: { id: true, nombre: true, usuario: true } },
          creadoEn: true,
          actualizadoEn: true,
          _count: { select: { bolsas: true } },
        },
      });
      if (!row)
        return res
          .status(404)
          .json({ mensaje: "Tipo de desecho no encontrado" });
      res.json(row);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /**
   * GET /tipos-desecho/existe?nombre=...&excludeId=...
   * Verifica duplicidad de nombre
   */
  router.get("/existe", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const nombre = normalizeText(req.query.nombre || "");
      const excludeId = Number(req.query.excludeId || 0);
      if (!nombre) return res.json({ nombreOcupado: false });

      const where = { nombre };
      if (excludeId) where.NOT = { id: excludeId };

      const r = await prisma.tipoDesecho.findFirst({ where, select: { id: true } });
      res.json({ nombreOcupado: !!r });
    } catch (e) {
      console.error(e);
      res.json({ nombreOcupado: false });
    }
  });

  /**
   * POST /tipos-desecho
   */
  router.post("/", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const nombre = normalizeText(req.body?.nombre || "");
      const descripcion = normalizeText(req.body?.descripcion || "");
      if (!nombre) {
        return res.status(400).json({ mensaje: "El nombre es obligatorio" });
      }

      const row = await prisma.tipoDesecho.create({
        data: {
          nombre,
          descripcion: descripcion || null,
          creadoPorId: req.user.id,
        },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          estado: true,
          creadoPor: { select: { id: true, nombre: true, usuario: true } },
          _count: { select: { bolsas: true } },
        },
      });
      res.status(201).json(row);
    } catch (e) {
      if (e?.code === "P2002") {
        return res
          .status(409)
          .json({ mensaje: "Ya existe un tipo de desecho con ese nombre" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /**
   * PUT /tipos-desecho/:id
   */
  router.put("/:id", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const nombre = normalizeText(req.body?.nombre || "");
      const descripcion = normalizeText(req.body?.descripcion || "");
      if (!nombre) {
        return res.status(400).json({ mensaje: "El nombre es obligatorio" });
      }

      const row = await prisma.tipoDesecho.update({
        where: { id },
        data: { nombre, descripcion: descripcion || null },
        select: {
          id: true,
          nombre: true,
          descripcion: true,
          estado: true,
          creadoPor: { select: { id: true, nombre: true, usuario: true } },
          _count: { select: { bolsas: true } },
        },
      });
      res.json(row);
    } catch (e) {
      if (e?.code === "P2002") {
        return res
          .status(409)
          .json({ mensaje: "Ya existe un tipo de desecho con ese nombre" });
      }
      if (e?.code === "P2025") {
        return res
          .status(404)
          .json({ mensaje: "Tipo de desecho no encontrado" });
      }
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /**
   * PATCH /tipos-desecho/:id/disable
   * (soft-disable)
   */
  router.patch("/:id/disable", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const upd = await prisma.tipoDesecho.update({
        where: { id },
        data: { estado: false },
        select: { id: true, nombre: true, estado: true },
      });
      res.json(upd);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /**
   * PATCH /tipos-desecho/:id/enable
   */
  router.patch("/:id/enable", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const upd = await prisma.tipoDesecho.update({
        where: { id },
        data: { estado: true },
        select: { id: true, nombre: true, estado: true },
      });
      res.json(upd);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /**
   * DELETE /tipos-desecho/:id
   * ?hard=true => elimina definitivamente (solo si no hay bolsas asociadas)
   * sin ?hard => soft delete (estado=false)
   */
  router.delete("/:id", auth, requirePerm("TIPOS_DESECHO"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const hard = String(req.query.hard || "").toLowerCase() === "true";

      const actual = await prisma.tipoDesecho.findUnique({
        where: { id },
        select: { id: true, estado: true, _count: { bolsas: true } },
      });
      if (!actual) {
        return res
          .status(404)
          .json({ mensaje: "Tipo de desecho no encontrado" });
      }

      if (!hard) {
        // soft delete
        const upd = await prisma.tipoDesecho.update({
          where: { id },
          data: { estado: false },
          select: { id: true, nombre: true, estado: true },
        });
        return res.json(upd);
      }

      // hard delete: validar que esté deshabilitado y sin bolsas asociadas
      if (actual.estado) {
        return res.status(400).json({
          mensaje:
            "Deshabilita el tipo antes de eliminarlo definitivamente",
        });
      }
      if (actual._count.bolsas > 0) {
        return res.status(400).json({
          mensaje:
            "No se puede eliminar definitivamente: hay bolsas asociadas a este tipo",
        });
      }

      await prisma.tipoDesecho.delete({ where: { id } });
      res.status(204).send();
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  return router;
};
