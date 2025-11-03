// backend/src/routes/scale.routes.js
const { Router } = require('express');
const { SerialPort } = require('serialport');

module.exports = function scaleRoutes({ io, auth } = {}) {
  const router = Router();

  // ===== Estado en memoria =====
  let port = null;
  let lastRaw = '';
  let lastValue = null;
  let lastCfg = null;
  let echoTimer = null;

  // ===== Emitters =====
  const emitStatus = () => io?.emit('scale:status', { connected: !!port?.readable });
  const emitRaw    = (raw) => io?.emit('scale:raw', { raw });
  const emitWeight = (value, raw) => io?.emit('scale:weight', { value, raw });

  // ===== Parser de peso (tolerante a CAS / unidades / coma decimal) =====
  function parseWeightLine(line) {
    if (!line) return null;

    // 1) número + unidad separada (lb|kg)
    let m = line.match(/(-?\d+(?:[.,]\d+)?)\s*(lb|kg)/i);
    if (m) {
      const num = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      return unit === 'kg' ? num * 2.20462 : num;
    }

    // 2) Formatos CAS con prefijos: ST, GS, US, NT, OK/HI/LO + número + unidad pegados
    m = line.match(/(?:ST|US|NT|GS|OK|LO|HI)[^0-9+-]*([+-]?\d+(?:[.,]\d+)?)(lb|kg)/i);
    if (m) {
      const num = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      return unit === 'kg' ? num * 2.20462 : num;
    }

    // 3) Solo número (si el indicador no manda unidad). Asumimos LB.
    m = line.match(/([+-]?\d+(?:[.,]\d+)?)/);
    if (m) {
      return parseFloat(m[1].replace(',', '.'));
    }

    return null;
  }

  async function closePort() {
    try { if (echoTimer) { clearInterval(echoTimer); echoTimer = null; } } catch (_) {}
    if (port) {
      try {
        await new Promise((resolve) => {
          try { port.close(() => resolve()); } catch (_) { resolve(); }
        });
      } catch (_) {}
    }
    port = null;
    lastCfg = null;
    emitStatus();
  }

  // ===== Rutas =====

  // Lista puertos disponibles
  router.get('/ports', async (_req, res) => {
    try {
      const list = await SerialPort.list();
      const ports = list.map(p => ({
        path: p.path,
        friendly: `${p.path}${p.manufacturer ? ' ' + p.manufacturer : ''}${p.friendlyName ? ' ' + p.friendlyName : ''}`.trim()
      }));
      res.json({ ports });
    } catch (e) {
      res.status(500).json({ mensaje: e.message || 'No se pudieron listar los puertos' });
    }
  });

  // Estado
  router.get('/status', (_req, res) => {
    res.json({
      connected: !!port?.readable,
      lastRaw,
      lastValue,
      cfg: lastCfg || null,
    });
  });

  // Conectar (acepta params y hace split por \r\n|\n|\r)
  router.post('/connect', async (req, res) => {
    const {
      path,
      baudRate = 9600,
      dataBits = 8,
      parity = 'none',   // 'none' | 'even' | 'odd'
      stopBits = 1,
      // lineTerminator se ignora a propósito; usamos regex flexible
      lineTerminator, // eslint-friendly
      echoIntervalMs = 0,
    } = req.body || {};

    if (!path) return res.status(400).json({ mensaje: 'Falta path (COMx)' });

    try {
      // Cierra si había uno abierto
      if (port?.readable) await closePort();

      port = new SerialPort({
        path,
        baudRate: Number(baudRate),
        dataBits: Number(dataBits),
        parity,
        stopBits: Number(stopBits),
        autoOpen: true,
      });

      // Buffer de línea manual para soportar \r\n | \n | \r
      let partial = '';

      // Eventos del puerto
      port.on('open', () => {
        lastCfg = { path, baudRate, dataBits, parity, stopBits, lineTerminator: 'AUTO(\\r\\n|\\n|\\r)', echoIntervalMs };
        emitStatus();
      });

      port.on('error', (err) => {
        io?.emit('scale:error', { message: err?.message || 'Error en puerto' });
      });

      port.on('close', () => {
        emitStatus();
      });

      // Lectura de datos crudos
      port.on('data', (chunk) => {
        try {
          const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
          partial += str;

          // Separamos por cualquier terminador
          const parts = partial.split(/\r\n|\n|\r/);
          partial = parts.pop(); // lo último puede quedar incompleto

          for (const line of parts) {
            const clean = String(line || '').trim();
            if (!clean) continue;
            lastRaw = clean;
            emitRaw(lastRaw);
            const v = parseWeightLine(lastRaw);
            if (typeof v === 'number' && !Number.isNaN(v)) {
              lastValue = v;
              emitWeight(v, lastRaw);
            }
          }
        } catch (_) {}
      });

      // Keepalive opcional
      if (echoIntervalMs > 0) {
        echoTimer = setInterval(() => {
          try { port?.write('\r\n'); } catch (_) {}
        }, Number(echoIntervalMs));
      }

      res.json({ ok: true, connected: true });
    } catch (e) {
      await closePort();
      res.status(500).json({ mensaje: e.message || 'No se pudo abrir el puerto' });
    }
  });

  // Desconectar
  router.post('/disconnect', async (_req, res) => {
    await closePort();
    res.json({ ok: true });
  });

  // Forzar PRINT (para tu botón del frontend)
  // Acepta: { sequence: ["P\\r\\n","ENQ","ESC_P"] }
  router.post('/print', async (req, res) => {
    if (!port?.writable) return res.status(409).json({ mensaje: 'No hay puerto abierto' });
    const seq = Array.isArray(req.body?.sequence) ? req.body.sequence : ['P\\r\\n'];

    try {
      for (const token of seq) {
        if (token === 'ENQ') {
          port.write(Buffer.from([0x05])); // ENQ
        } else if (token === 'ESC_P') {
          port.write(Buffer.from([0x1B, 0x50])); // ESC P
        } else {
          // "P\r\n" ó "P\\r\\n"
          const str = token.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
          port.write(str);
        }
        await new Promise(r => setTimeout(r, 120));
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ mensaje: e.message || 'No se pudo enviar PRINT' });
    }
  });

  // TX crudo opcional (ASCII o HEX)
  // body: { ascii: "P\r\n" } ó { hex: "1B 50" }
  router.post('/tx', async (req, res) => {
    if (!port?.writable) return res.status(409).json({ mensaje: 'No hay puerto abierto' });
    try {
      if (req.body?.ascii) {
        const out = String(req.body.ascii).replace(/\\r/g, '\r').replace(/\\n/g, '\n');
        port.write(out);
      } else if (req.body?.hex) {
        const bytes = String(req.body.hex)
          .split(/\s+/).filter(Boolean).map(h => parseInt(h, 16));
        port.write(Buffer.from(bytes));
      } else {
        return res.status(400).json({ mensaje: 'Falta ascii o hex' });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ mensaje: e.message || 'No se pudo enviar' });
    }
  });

  return router;
};
