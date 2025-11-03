// src/routes/areas.routes.js
const { Router } = require('express');

module.exports = function areasRoutes(prisma, { auth, requirePerm }) {
  const router = Router();

  // LISTAR
  router.get('/', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      const eliminados = (req.query.estado || 'activos') === 'eliminados';
      const where = {
        estado: eliminados ? false : true,
        ...(q && {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
          ],
        }),
      };
      const rows = await prisma.area.findMany({
        where,
        include: { creadoPor: { select: { id: true, nombre: true, usuario: true } } },
        orderBy: [{ nombre: 'asc' }],
      });
      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // DETALLE
  router.get('/:id', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const area = await prisma.area.findUnique({
        where: { id: Number(req.params.id) },
        include: { creadoPor: { select: { id: true, nombre: true, usuario: true } } },
      });
      if (!area) return res.status(404).json({ mensaje: 'Área no encontrada' });
      res.json(area);
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // === NUEVO: Tipos permitidos por área (GET) ===
  router.get('/:id/tipos', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const area = await prisma.area.findUnique({ where: { id } });
      if (!area) return res.status(404).json({ mensaje: 'Área no encontrada' });

      const rows = await prisma.areaTipoDesecho.findMany({
        where: { areaId: id, activo: true },
        include: { tipo: true },
        orderBy: { tipoDesechoId: 'asc' },
      });

      res.json({
        tipos: rows.map(r => ({
          id: r.tipo.id,
          nombre: r.tipo.nombre,
          slug: r.tipo.slug,
          estado: r.activo,
        })),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // === NUEVO: Reemplazar lista de tipos permitidos (PUT) ===
  router.put('/:id/tipos', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { tipoIds } = req.body || {};
      if (!Array.isArray(tipoIds)) {
        return res.status(400).json({ mensaje: 'tipoIds debe ser un arreglo' });
      }

      const area = await prisma.area.findUnique({ where: { id } });
      if (!area) return res.status(404).json({ mensaje: 'Área no encontrada' });

      // Normalizar y filtrar IDs válidos que existan
      const ids = [...new Set(tipoIds.map(n => Number(n)).filter(n => Number.isInteger(n)))];
      const existentes = await prisma.tipoDesecho.findMany({
        where: { id: { in: ids }, estado: true },
        select: { id: true },
      });
      const validIds = existentes.map(t => t.id);

      await prisma.$transaction([
        prisma.areaTipoDesecho.deleteMany({ where: { areaId: id } }),
        validIds.length
          ? prisma.areaTipoDesecho.createMany({
              data: validIds.map(tid => ({ areaId: id, tipoDesechoId: tid, activo: true })),
            })
          : Promise.resolve(),
      ]);

      res.json({ ok: true, asignados: validIds });
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // VALIDAR NOMBRE
  router.get('/existe', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const { nombre, excludeId } = req.query || {};
      if (!nombre) return res.json({ nombreOcupado: false });
      const a = await prisma.area.findFirst({
        where: { nombre, ...(excludeId ? { NOT: { id: Number(excludeId) } } : {}) },
        select: { id: true },
      });
      res.json({ nombreOcupado: !!a });
    } catch (e) {
      console.error(e);
      res.json({ nombreOcupado: false });
    }
  });

  // CREAR
  router.post('/', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const { nombre, descripcion } = req.body || {};
      if (!nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
      const area = await prisma.area.create({
        data: { nombre: nombre.trim(), descripcion: (descripcion || '').trim(), creadoPorId: req.user.id },
        include: { creadoPor: { select: { id: true, nombre: true, usuario: true } } },
      });
      res.status(201).json(area);
    } catch (e) {
      if (e?.code === 'P2002') return res.status(409).json({ mensaje: 'Ya existe un área con ese nombre' });
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // ACTUALIZAR
  router.put('/:id', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { nombre, descripcion } = req.body || {};
      if (!nombre?.trim()) return res.status(400).json({ mensaje: 'El nombre es obligatorio' });
      const area = await prisma.area.update({
        where: { id },
        data: { nombre: nombre.trim(), descripcion: (descripcion || '').trim() },
        include: { creadoPor: { select: { id: true, nombre: true, usuario: true } } },
      });
      res.json(area);
    } catch (e) {
      if (e?.code === 'P2002') return res.status(409).json({ mensaje: 'Ya existe un área con ese nombre' });
      if (e?.code === 'P2025') return res.status(404).json({ mensaje: 'Área no encontrada' });
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // DESHABILITAR
  router.patch('/:id/disable', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      res.json(await prisma.area.update({ where: { id: Number(req.params.id) }, data: { estado: false } }));
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // HABILITAR
  router.patch('/:id/enable', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      res.json(await prisma.area.update({ where: { id: Number(req.params.id) }, data: { estado: true } }));
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  // ELIMINAR (blando/duro)
  router.delete('/:id', auth, requirePerm('AREAS'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const hard = String(req.query.hard || '').toLowerCase() === 'true';
      const actual = await prisma.area.findUnique({ where: { id } });
      if (!actual) return res.status(404).json({ mensaje: 'Área no encontrada' });

      if (!hard) {
        return res.json(await prisma.area.update({ where: { id }, data: { estado: false } }));
      }

      if (actual.estado) return res.status(400).json({ mensaje: 'Deshabilita el área antes de eliminarla definitivamente' });
      await prisma.area.delete({ where: { id } });
      res.status(204).send();
    } catch (e) {
      console.error(e);
      res.status(500).json({ mensaje: 'Error en el servidor' });
    }
  });

  return router;
};
