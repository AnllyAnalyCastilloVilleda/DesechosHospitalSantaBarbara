import { useEffect, useRef } from "react";

function isEditable(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
}

/**
 * Captura escaneos a nivel global y entrega el payload cuando:
 *  - llega una tecla de fin (Enter/Tab por defecto), o
 *  - expira el debounce (maxDelay), o
 *  - se detecta '}' y pasa un mini delay (endCharDelay).
 *
 * Siempre llama a onReady(objOrNull, rawText) con el bloque final.
 *
 * opts:
 *  - allowFrom: selector CSS permitido aunque el target sea editable
 *  - endKeys: array de teclas que finalizan (default ["Enter","Tab"])
 *  - maxDelay: ms de inactividad para finalizar (default 120)
 *  - endCharDelay: ms tras recibir '}' para finalizar (default 10)
 *  - minLength: longitud mínima para disparar onReady (default 1)
 *  - parseJSON: intenta JSON.parse del bloque {...} (default true)
 *  - preferBraces: intenta extraer bloque {...} de texto con ruido (default true)
 *  - onRaw: callback(text) – se llama cada vez que cambia el buffer (debug)
 */
export function useScannerGlobal(onReady, opts = {}) {
  const {
    allowFrom = null,
    endKeys = ["Enter", "Tab"],
    maxDelay = 120,
    endCharDelay = 10,
    minLength = 1,
    parseJSON = true,
    preferBraces = true,
    onRaw = null,
  } = opts;

  const bufRef = useRef("");
  const timerRef = useRef(null);

  useEffect(() => {
    const clearTimer = () => clearTimeout(timerRef.current);

    const reset = () => {
      bufRef.current = "";
      clearTimer();
    };

    const finalize = () => {
      clearTimer();
      const raw = bufRef.current;
      bufRef.current = "";

      const t = (raw || "").trim();
      if (!t || t.length < minLength) return;

      // Extrae bloque {...} si hay ruido alrededor
      if (preferBraces) {
        const i = t.indexOf("{");
        const j = t.lastIndexOf("}");
        if (i >= 0 && j > i) {
          const block = t.slice(i, j + 1);
          if (parseJSON) {
            try {
              const obj = JSON.parse(block);
              onReady?.(obj, block);
              return;
            } catch {
              onReady?.(null, block); // JSON roto -> devuelve bloque como texto
              return;
            }
          } else {
            onReady?.(null, block);
            return;
          }
        }
      }

      // Si no hay bloque con llaves, intenta parsear todo el texto si parece JSON
      if (parseJSON && t.startsWith("{") && t.endsWith("}")) {
        try {
          const obj = JSON.parse(t);
          onReady?.(obj, t);
          return;
        } catch {
          // cae abajo como texto plano
        }
      }

      onReady?.(null, t);
    };

    const scheduleFinalize = (delay) => {
      clearTimer();
      timerRef.current = setTimeout(finalize, delay);
    };

    const onKeyDown = (ev) => {
      // Evita captura en inputs normales (salvo allowFrom)
      if (isEditable(ev.target)) {
        if (!(allowFrom && ev.target.matches?.(allowFrom))) return;
      }

      // Escape: cancelar buffer
      if (ev.key === "Escape") {
        reset();
        return;
      }

      // Teclas de finalización
      if (endKeys.includes(ev.key)) {
        ev.preventDefault(); // evita Enter/Tab en formularios
        finalize();
        return;
      }

      // Backspace: quitar último char del buffer
      if (ev.key === "Backspace") {
        if (bufRef.current.length > 0) {
          bufRef.current = bufRef.current.slice(0, -1);
          onRaw?.(bufRef.current);
          scheduleFinalize(maxDelay);
        }
        return;
      }

      // Caracteres visibles (lectores HID envían todo como tecleo rápido)
      if (ev.key && ev.key.length === 1) {
        bufRef.current += ev.key;
        onRaw?.(bufRef.current);
        if (ev.key === "}") {
          scheduleFinalize(endCharDelay);
        } else {
          scheduleFinalize(maxDelay);
        }
      }
    };

    // Algunos lectores pegan todo el contenido (evento paste)
    const onPaste = (ev) => {
      if (isEditable(ev.target) && !(allowFrom && ev.target.matches?.(allowFrom))) {
        return; // respeta pegado normal en inputs no permitidos
      }
      const text = ev.clipboardData?.getData("text");
      if (!text) return;

      ev.preventDefault();
      bufRef.current += text;
      onRaw?.(bufRef.current);

      if (/\}\s*$/.test(text)) {
        scheduleFinalize(endCharDelay);
      } else {
        scheduleFinalize(maxDelay);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("paste", onPaste, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("paste", onPaste, true);
      clearTimer();
    };
  }, [
    onReady,
    allowFrom,
    endKeys,
    maxDelay,
    endCharDelay,
    minLength,
    parseJSON,
    preferBraces,
    onRaw,
  ]);
}
