
import { useEffect, useRef } from "react";

function isEditable(el) {
  if (!el) return false;
  const t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
}

/**
 * Captura el lector a nivel global. Siempre llama a onReady(objOrNull, rawText).
 * opts.allowFrom: selector CSS que, si coincide con el target, NO se ignora aunque sea un input.
 */
export function useScannerGlobal(onReady, opts = {}) {
  const { allowFrom = null } = opts;
  const bufRef = useRef("");
  const timerRef = useRef(null);

  useEffect(() => {
    const finalize = () => {
      const raw = bufRef.current;
      bufRef.current = "";

      // Intentar extraer bloque {...}
      const i = raw.indexOf("{");
      const j = raw.lastIndexOf("}");
      if (i >= 0 && j > i) {
        const text = raw.slice(i, j + 1);
        try {
          const obj = JSON.parse(text);
          onReady?.(obj, text);
          return;
        } catch {
          onReady?.(null, text); // JSON roto → igual devolvemos texto
          return;
        }
      }

      const t = raw.trim();
      if (t) onReady?.(null, t);
    };

    const onKeyDown = (ev) => {
      // Si viene de un input/textarea… solo lo aceptamos si coincide con allowFrom
      if (isEditable(ev.target)) {
        if (!(allowFrom && ev.target.matches?.(allowFrom))) return;
      }

      if (ev.key === "Enter" || ev.key === "Tab") {
        ev.preventDefault();
        finalize();
        return;
      }

      if (ev.key && ev.key.length === 1) {
        bufRef.current += ev.key;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(finalize, ev.key === "}" ? 10 : 120);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(timerRef.current);
    };
  }, [onReady, allowFrom]);
}
