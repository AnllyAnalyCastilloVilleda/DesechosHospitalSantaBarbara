const { Router } = require("express");
const { SerialPort, ReadlineParser } = require("serialport");

module.exports = function scaleRoutes({ auth, requirePerm }) {
  const router = Router();

  let port = null;
  let parser = null;
  let last = { weightKg: null, stable: false, raw: "", at: null };

  function parseLine(line) {
    // Ejemplos típicos: "ST,GS,  1.234 kg", "US,+0.456 kg", "  1234 g"
    const m = line.match(/(ST|SI|OK|US)?[^-\d]*(-?\d+(?:\.\d+)?)\s*(kg|g)?/i);
    const unit = (m?.[3] || "kg").toLowerCase();
    const value = m ? parseFloat(m[2]) : null;
    const kg = value == null ? null : (unit === "g" ? value / 1000 : value);
    const stable = /(ST|SI|OK)/i.test(line);
    last = { weightKg: kg, stable, raw: line, at: Date.now() };
  }

  // Conectar a un puerto (o simular)
  router.post("/scale/connect", auth, requirePerm("REGISTRO"), async (req, res) => {
    const { path, baudRate = 9600, simulate = false } = req.body || {};

    // Cerrar previo
    if (port) try { port.close(); } catch {}
    port = null; parser = null;
    last = { weightKg: null, stable: false, raw: "", at: null };

    if (simulate) {
      // Simulador simple interno (sin COM virtual)
      if (parser) parser.removeAllListeners();
      setInterval(() => {
        const v = (Math.random() * 5 + 0.2).toFixed(3);
        parseLine(`ST,GS, ${v} kg`);
      }, 500);
      return res.json({ ok: true, mode: "simulate" });
    }

    // Puerto real
    try {
      port = new SerialPort({ path, baudRate, autoOpen: true });
      parser = port.pipe(new ReadlineParser({ delimiter: /\r\n|\n/ }));
      parser.on("data", (line) => parseLine(String(line)));
      port.on("error", (e) => console.error("SCALE ERROR:", e));
      return res.json({ ok: true, mode: "serial", path, baudRate });
    } catch (e) {
      console.error(e);
      return res.status(400).json({ mensaje: "No se pudo abrir el puerto." });
    }
  });

  // Listar puertos disponibles
  router.get("/scale/ports", auth, requirePerm("REGISTRO"), async (_req, res) => {
    const list = await SerialPort.list();
    res.json(list.map(p => ({ path: p.path, manufacturer: p.manufacturer || "" })));
  });

  // Última lectura capturada
  router.get("/scale/read", auth, requirePerm("REGISTRO"), (_req, res) => {
    res.json(last);
  });

  return router;
};
