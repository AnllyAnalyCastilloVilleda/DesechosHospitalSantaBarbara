// src/routes/qr.routes.js
"use strict";

const express = require("express");
const crypto = require("crypto");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

module.exports = function qrRoutes(prisma, { auth, requirePerm }) {
  const router = express.Router();

  // ===== Mapas de modelos (robusto a casing) =====
  const M = {
    area:        prisma.area ?? null,
    bolsa:       prisma.bolsa ?? null,
    tipoDesecho: prisma.tipoDesecho ?? prisma.tipodesecho ?? null,
    lote:        prisma.loteQR ?? prisma.loteQr ?? prisma.loteqr ?? null,
    etiqueta:    prisma.etiquetaQR ?? prisma.etiquetaQr ?? prisma.etiquetaqr ?? null,
  };
  function ensureModels(...keys) {
    const miss = keys.filter(k => !M[k]);
    if (miss.length) {
      const available = Object.keys(prisma).filter(k => typeof prisma[k] === "object" && !k.startsWith("$"));
      const err = new Error(`Modelos faltantes: ${miss.join(", ")}. Disponibles: ${available.join(", ")}`);
      err.code = "MODELS_MISSING";
      throw err;
    }
  }
  // Helpers para modelos dentro de una transacción
  function txM(tx) {
    return {
      lote:     tx.loteQR ?? tx.loteQr ?? tx.loteqr,
      etiqueta: tx.etiquetaQR ?? tx.etiquetaQr ?? tx.etiquetaqr,
    };
  }

  // ===== Util: códigos cortos y humanos para QR =====
  function genCode() {
    const a = Date.now().toString(36).toUpperCase();
    const b = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `${a}${b}`;
  }

  // ===== Helpers de maquetado de PDF =====
  function gridFor(porHoja) {
    const n = Number(porHoja) || 4;
    switch (n) {
      case 1:  return { cols: 1, rows: 1 };
      case 2:  return { cols: 1, rows: 2 };
      case 4:  return { cols: 2, rows: 2 };
      case 6:  return { cols: 3, rows: 2 };
      case 8:  return { cols: 4, rows: 2 };
      case 10: return { cols: 5, rows: 2 };
      case 12: return { cols: 4, rows: 3 };
      default: {
        const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
        const rows = Math.max(1, Math.ceil(n / cols));
        return { cols, rows };
      }
    }
  }

  /* =========================
     GET /qr/tipos
     Tipos PERMITIDOS para un área (por AreaTipoDesecho).
     Si un área no tiene configuración, devuelve todos los tipos activos.
  ========================= */
  router.get("/tipos", auth, requirePerm("CODIGOS_QR"), async (req, res) => {
    try {
      const areaId = Number(req.query.areaId || 0);
      if (!areaId) return res.status(400).json({ mensaje: "areaId requerido" });

      const area = await prisma.area.findUnique({ where: { id: areaId } });
      if (!area || area.estado === false) {
        return res.status(404).json({ mensaje: "Área no encontrada" });
      }

      // Enlaces configurados para el área
      const links = await prisma.areaTipoDesecho.findMany({
        where: { areaId, activo: true },
        select: { tipoDesechoId: true },
      });

      let tipos;
      if (links.length) {
        const ids = links.map(l => l.tipoDesechoId);
        tipos = await prisma.tipoDesecho.findMany({
          where: { id: { in: ids }, estado: true },
          orderBy: { nombre: "asc" },
        });
      } else {
        // Fallback: si no hay configuración explícita, mostrar todos los activos
        tipos = await prisma.tipoDesecho.findMany({
          where: { estado: true },
          orderBy: { nombre: "asc" },
        });
      }

      res.json(tipos);
    } catch (e) {
      console.error("GET /qr/tipos error:", e);
      res.status(500).json({ mensaje: "Error en el servidor" });
    }
  });

  /* =========================
     POST /qr/generar
     Crea un lote + etiquetas (ACTIVAS)
  ========================= */
  router.post("/generar", auth, requirePerm("CODIGOS_QR"), async (req, res) => {
    try {
      ensureModels("area", "bolsa", "lote", "etiqueta");

      const areaId        = Number(req.body?.areaId);
      const bolsaId       = Number(req.body?.bolsaId);
      const tipoDesechoId = req.body?.tipoDesechoId != null ? Number(req.body.tipoDesechoId) : null;
      const porHoja       = Math.max(1, Number(req.body?.porHoja) || 4);
      const cantidad      = Math.max(1, Number(req.body?.cantidad) || porHoja);

      if (!Number.isInteger(areaId) || !Number.isInteger(bolsaId)) {
        return res.status(400).json({ mensaje: "areaId y bolsaId son requeridos" });
      }

      const [area, bolsa] = await Promise.all([
        M.area.findUnique({ where: { id: areaId } }),
        M.bolsa.findUnique({
          where: { id: bolsaId },
          include: { tipoDesecho: { select: { id: true, nombre: true } } },
        }),
      ]);

      if (!area || !bolsa) return res.status(404).json({ mensaje: "Área o Bolsa no existe" });
      if (area.estado === false)  return res.status(400).json({ mensaje: "El área está deshabilitada" });
      if (bolsa.estado === false) return res.status(400).json({ mensaje: "La bolsa está deshabilitada" });

      if (!bolsa.tipoDesechoId) {
        return res.status(400).json({ mensaje: "La bolsa seleccionada no tiene un tipo de desecho asignado." });
      }
      if (tipoDesechoId && Number(bolsa.tipoDesechoId) !== Number(tipoDesechoId)) {
        return res.status(400).json({ mensaje: "La bolsa no corresponde al tipo de desecho seleccionado." });
      }

      const out = await prisma.$transaction(async (tx) => {
        const T = txM(tx);
        // 1) Crear lote
        const lote = await T.lote.create({
          data: {
            areaId,
            bolsaId,
            cantidad,
            porHoja,
            creadoPorId: req.user?.id || null,
          },
        });

        // 2) Generar y crear etiquetas
        const codes = new Set();
        while (codes.size < cantidad) codes.add(genCode());
        const dataEtiquetas = Array.from(codes).map((codigo) => ({
          codigo,
          loteId: lote.id,
          areaId,
          bolsaId,
          estado: "ACTIVA",
        }));

        await T.etiqueta.createMany({ data: dataEtiquetas });

        // 3) Recuperar etiquetas recién creadas ordenadas
        const etiquetas = await T.etiqueta.findMany({
          where: { loteId: lote.id },
          select: { id: true, codigo: true },
          orderBy: { id: "asc" },
        });

        return { lote, etiquetas };
      });

      res.json({
        loteId: out.lote.id,
        area:  { id: area.id, nombre: area.nombre },
        bolsa: { id: bolsa.id, color: bolsa.color, tamano: bolsa.tamano, tipoDesechoId: bolsa.tipoDesechoId },
        tipoDesecho: bolsa.tipoDesecho ? { id: bolsa.tipoDesecho.id, nombre: bolsa.tipoDesecho.nombre } : null,
        porHoja,
        cantidad,
        etiquetas: out.etiquetas.map((e) => ({ id: e.id, codigo: e.codigo })),
      });
    } catch (e) {
      if (e?.code === "P2002") {
        return res.status(409).json({ mensaje: "Conflicto de código QR (intenta otra vez)" });
      }
      if (e?.code === "MODELS_MISSING") {
        console.error(e.message);
        return res.status(500).json({ mensaje: e.message });
      }
      console.error("Error /qr/generar:", e);
      res.status(500).json({ mensaje: "Error generando lote/etiquetas" });
    }
  });

  /* =========================
     GET /qr/lotes
     Lista lotes con conteos y si se pueden eliminar
  ========================= */
  router.get("/lotes", auth, requirePerm("CODIGOS_QR"), async (req, res) => {
    try {
      ensureModels("lote", "etiqueta");

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 12));

      const where = {};
      if (req.query.areaId)  where.areaId  = Number(req.query.areaId);
      if (req.query.bolsaId) where.bolsaId = Number(req.query.bolsaId);

      const [total, rows] = await Promise.all([
        M.lote.count({ where }),
        M.lote.findMany({
          where,
          orderBy: { id: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            area:  { select: { id: true, nombre: true } },
            bolsa: { select: { id: true, color: true, tamano: true, tipoDesechoId: true } },
            _count: { select: { etiquetas: true } }, // requiere que la relación se llame "etiquetas"
          },
        }),
      ]);

      // Conteo de usadas por lote para bloquear borrado
      const ids = rows.map((r) => r.id);
      let usadasMap = {};
      if (ids.length) {
        if (typeof M.etiqueta.groupBy === "function") {
          const group = await M.etiqueta.groupBy({
            by: ["loteId"],
            _count: { _all: true },
            where: { loteId: { in: ids }, estado: "USADA" },
          });
          usadasMap = group.reduce((acc, g) => {
            acc[g.loteId] = g._count._all || 0;
            return acc;
          }, {});
        } else {
          // Fallback (Prisma muy viejo sin groupBy): computar en JS
          const usadas = await M.etiqueta.findMany({
            where: { loteId: { in: ids }, estado: "USADA" },
            select: { loteId: true },
          });
          usadas.forEach(u => { usadasMap[u.loteId] = (usadasMap[u.loteId] || 0) + 1; });
        }
      }

      const items = rows.map((L) => ({
        id: L.id,
        area: L.area,
        bolsa: L.bolsa,
        cantidad: L.cantidad,
        porHoja: L.porHoja,
        _count: { etiquetas: L._count?.etiquetas ?? 0 },
        puedeEliminar: (usadasMap[L.id] || 0) === 0,
      }));

      res.json({ page, pageSize, total, items });
    } catch (e) {
      if (e?.code === "MODELS_MISSING") {
        console.error(e.message);
        return res.status(500).json({ mensaje: e.message });
      }
      console.error("Error /qr/lotes:", e);
      res.status(500).json({ mensaje: "Error listando lotes" });
    }
  });

  /* =========================
     DELETE /qr/lotes/:id
     Borra lote si NO tiene etiquetas USADAS
  ========================= */
  router.delete("/lotes/:id", auth, requirePerm("CODIGOS_QR"), async (req, res) => {
    try {
      ensureModels("lote", "etiqueta");
      const id = Number(req.params.id);

      const usadas = await M.etiqueta.count({ where: { loteId: id, estado: "USADA" } });
      if (usadas > 0) {
        return res.status(400).json({ mensaje: "No se puede eliminar: hay etiquetas usadas en el lote" });
      }

      await prisma.$transaction(async (tx) => {
        const T = txM(tx);
        await T.etiqueta.deleteMany({ where: { loteId: id } });
        await T.lote.delete({ where: { id } });
      });

      res.status(204).send();
    } catch (e) {
      if (e?.code === "MODELS_MISSING") {
        console.error(e.message);
        return res.status(500).json({ mensaje: e.message });
      }
      console.error("Error /qr/lotes/:id [DELETE]:", e);
      res.status(500).json({ mensaje: "Error eliminando lote" });
    }
  });

  /* =========================
     GET /qr/lotes/:id/pdf
     Genera PDF con etiquetas QR del lote
  ========================= */
  router.get("/lotes/:id/pdf", auth, requirePerm("CODIGOS_QR"), async (req, res) => {
    try {
      ensureModels("lote", "etiqueta");

      const id = Number(req.params.id);
      const lote = await M.lote.findUnique({
        where: { id },
        include: {
          area:  { select: { id: true, nombre: true } },
          bolsa: { select: { id: true, color: true, tamano: true, tipoDesechoId: true, tipoDesecho: { select: { nombre: true } } } },
          etiquetas: { orderBy: { id: "asc" }, select: { id: true, codigo: true } },
        },
      });
      if (!lote) return res.status(404).json({ mensaje: "Lote no encontrado" });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="QR_Lote_${id}.pdf"`);

      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 36, left: 36, right: 36, bottom: 36 },
      });
      doc.info.Title = `QR Lote ${id}`;
      doc.pipe(res);

      const innerW = doc.page.width  - doc.page.margins.left - doc.page.margins.right;
      const innerH = doc.page.height - doc.page.margins.top  - doc.page.margins.bottom;

      const { cols, rows } = gridFor(lote.porHoja || 4);
      const perPage = cols * rows;
      const cellW = innerW / cols;
      const cellH = innerH / rows;

      const LAYOUTS = {
        8:  { qr: 170, fs: 10.5, gap: 2,  showTipo: true  },
        10: { qr: 150, fs: 10.0, gap: 3,  showTipo: true  },
        12: { qr: 130, fs:  9.4, gap: 3,  showTipo: false },
      };
      const L = LAYOUTS[lote.porHoja] || LAYOUTS[8];

      const stripDesechos = (s) => (s || "").replace(/^desechos?\s+/i, "");
      const textBlock = (text, x, y, maxW, font = "Helvetica", size = L.fs, color = "#111") => {
        const txt = String(text || "");
        doc.font(font).fontSize(size).fillColor(color);
        const opts = { width: maxW, align: "center" };
        const h = doc.heightOfString(txt, opts);
        doc.text(txt, x, y, opts);
        return h + L.gap;
      };

      const etiquetaCount = lote.etiquetas.length;
      for (let i = 0; i < etiquetaCount; i++) {
        if (i > 0 && i % perPage === 0) doc.addPage();

        const idx = i % perPage;
        const r = Math.floor(idx / cols);
        const c = idx % cols;

        const x = doc.page.margins.left + c * cellW;
        const y = doc.page.margins.top  + r * cellH;

        // Marco
        doc.save().roundedRect(x + 4, y + 4, cellW - 8, cellH - 8, 8).stroke("#dddddd").restore();

        // Payload del QR
        const et = lote.etiquetas[i];
        const payload = JSON.stringify({ t: "HSB_QR", c: et.codigo, a: lote.area.id, b: lote.bolsa.id });

        const qrSize = Math.min(L.qr, Math.max(96, Math.min(cellW, cellH) - 86));
        /* eslint-disable no-await-in-loop */
        const qrPng = await QRCode.toBuffer(payload, { width: Math.round(qrSize) });

        // QR centrado
        const imgX = x + (cellW - qrSize) / 2;
        const imgY = y + 14;
        doc.image(qrPng, imgX, imgY, { width: qrSize });

        // Área de texto
        const pad = 8;
        const wText = cellW - pad * 2;
        let ty = imgY + qrSize + 8;

        ty += textBlock(`Área: ${lote.area.nombre}`, x + pad, ty, wText);
        const bolsaTxt = `Bolsa: ${lote.bolsa.color}${lote.bolsa.tamano ? " " + lote.bolsa.tamano : ""}`;
        ty += textBlock(bolsaTxt, x + pad, ty, wText);
        if (L.showTipo && lote.bolsa?.tipoDesecho?.nombre) {
          ty += textBlock(`Tipo: ${stripDesechos(lote.bolsa.tipoDesecho.nombre)}`, x + pad, ty, wText);
        }

        ty += textBlock(`Código: ${et.codigo}`, x + pad, ty, wText, "Courier-Bold", L.fs + 0.5);
      }

      doc.end();
    } catch (e) {
      if (e?.code === "MODELS_MISSING") {
        console.error(e.message);
        return res.status(500).json({ mensaje: e.message });
      }
      console.error("Error /qr/lotes/:id/pdf:", e);
      res.status(500).json({ mensaje: "Error generando PDF" });
    }
  });

  return router;
};
