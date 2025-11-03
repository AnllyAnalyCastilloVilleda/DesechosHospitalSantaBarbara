// src/scale/scale.service.js (ESM)
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export class ScaleService {
  /**
   * Puedes instanciar así:
   *   new ScaleService({ io })
   * o también:
   *   new ScaleService(io)
   */
  constructor(depsOrIo) {
    // Soporta ambos estilos de construcción
    this.io = (depsOrIo && depsOrIo.io) ? depsOrIo.io : depsOrIo || null;

    this.port = null;         // SerialPort activo
    this.parser = null;       // parser de líneas
    this.config = null;       // última config usada
    this.lastWeight = 0;
    this.timerEcho = null;
  }

  async listPorts() {
    const ports = await SerialPort.list();
    return ports.map(p => ({
      path: p.path,           // p.ej. COM3
      manufacturer: p.manufacturer || '',
      serialNumber: p.serialNumber || '',
      productId: p.productId || '',
      vendorId: p.vendorId || '',
      friendly: `${p.path} ${p.manufacturer || ''}`.trim()
    }));
  }

  isConnected() {
    return !!(this.port && this.port.readable && this.port.writable);
  }

  /**
   * Conecta a la báscula.
   * @param {Object} options
   * @param {string} options.path - p.ej. "COM3" o "/dev/ttyUSB0"
   * @param {number} [options.baudRate=9600]
   * @param {number} [options.dataBits=8]
   * @param {'none'|'even'|'odd'} [options.parity='none']
   * @param {number} [options.stopBits=1]
   * @param {string} [options.lineTerminator='\r\n']
   * @param {number} [options.echoIntervalMs=0] - reenviar último peso cada N ms
   */
  async connect({
    path,
    baudRate = 9600,
    dataBits = 8,
    parity = 'none',
    stopBits = 1,
    lineTerminator = '\r\n',
    echoIntervalMs = 0
  }) {
    await this.disconnect();

    return new Promise((resolve, reject) => {
      try {
        this.config = { path, baudRate, dataBits, parity, stopBits, lineTerminator, echoIntervalMs };

        this.port = new SerialPort({ path, baudRate, dataBits, parity, stopBits }, (err) => {
          if (err) return reject(err);
        });

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: lineTerminator }));

        // Cada línea recibida puede venir como: "   1.254 kg", "0.540 lb", "0001.250", etc.
        this.parser.on('data', (raw) => {
          const w = this.parseWeight(raw);
          if (w != null) {
            this.lastWeight = w;
            this.io?.emit('scale:weight', { value: w, raw });
          } else {
            // también mandamos crudo para debug si deseas:
            this.io?.emit('scale:raw', { raw });
          }
        });

        this.port.on('open', () => {
          if (echoIntervalMs > 0) {
            this.timerEcho = setInterval(() => {
              if (this.lastWeight != null) {
                this.io?.emit('scale:weight', { value: this.lastWeight, raw: null });
              }
            }, echoIntervalMs);
          }
          this.io?.emit('scale:status', { connected: true });
          resolve({ ok: true });
        });

        this.port.on('error', (e) => {
          this.io?.emit('scale:error', { message: e.message });
        });

        this.port.on('close', () => {
          this.io?.emit('scale:status', { connected: false });
          if (this.timerEcho) clearInterval(this.timerEcho);
          this.timerEcho = null;
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async disconnect() {
    if (this.timerEcho) clearInterval(this.timerEcho);
    this.timerEcho = null;

    if (this.parser) {
      try { this.parser.removeAllListeners(); } catch (_) {}
      this.parser = null;
    }

    if (this.port) {
      const p = this.port;
      this.port = null;
      await new Promise(res => {
        try { p.close(() => res()); } catch (_) { res(); }
      });
    }

    this.io?.emit('scale:status', { connected: false });
  }

  /**
   * Normaliza pesos de varias formas de salida.
   * Convierte a libras si detecta kg o g/gr en la cadena.
   * Redondea a 3 decimales.
   */
  parseWeight(raw) {
    if (!raw) return null;
    const s = String(raw).trim();

    // 1) Busca número con opcional decimal
    const m = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    let val = Number(m[0]);
    if (!Number.isFinite(val)) return null;

    // 2) Detecta unidad si viene en el texto (lb/kg/g) y convierte a lb
    const lower = s.toLowerCase();

    if (lower.includes('kg')) {
      // kg -> lb
      val = val * 2.20462262185;
    } else if (/\b(g|gr|gram)\b/i.test(s)) {
      // g -> lb
      val = val * 0.00220462262185;
    }
    // Si ya viene en lb o sin unidad, lo dejamos como está.

    // 3) Redondeo estándar mostrado en UI
    return Number(val.toFixed(3));
  }
}
