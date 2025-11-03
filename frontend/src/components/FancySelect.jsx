// src/ui/FancySelect.jsx
import React, { useEffect, useMemo, useRef, useState, useId, useCallback } from "react";
import ReactDOM from "react-dom";

/**
 * FancySelect (accesible + portal + typeahead)
 *
 * Props:
 *  - options: Array<{ value:any, label:string }>
 *  - value: any
 *  - onChange: (val) => void
 *  - placeholder?: string
 *  - disabled?: boolean
 *  - className?: string
 *  - maxHeight?: number (alto del panel)
 */
export default function FancySelect({
  options = [],
  value,
  onChange,
  placeholder = "Selecciona…",
  disabled = false,
  className = "",
  maxHeight = 280,
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, place: "bottom" }); // place: bottom|top
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const popRef = useRef(null);
  const portalRoot = document.body;
  const uid = useId();
  const listboxId = `fs-list-${uid}`;
  const optionId = (idx) => `fs-opt-${uid}-${idx}`;

  const normalized = useMemo(
    () =>
      options.map((o, i) => ({
        ...o,
        _value: String(o.value),
        _label: String(o.label ?? o.value ?? ""),
        _idx: i,
      })),
    [options]
  );

  const curIdx = useMemo(
    () => normalized.findIndex((o) => o._value === String(value)),
    [normalized, value]
  );
  const current = curIdx >= 0 ? normalized[curIdx] : null;

  const openPanel = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setFocusIdx(curIdx >= 0 ? curIdx : Math.max(0, Math.min(0, normalized.length - 1)));
  }, [disabled, curIdx, normalized.length]);

  const closePanel = useCallback(() => {
    setOpen(false);
    // Devolver foco al botón
    setTimeout(() => btnRef.current?.focus?.(), 0);
  }, []);

  // Posicionamiento del popover
  const computePosition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;
    const place = spaceBelow >= Math.min(maxHeight, 220) || spaceBelow >= spaceAbove ? "bottom" : "top";
    const left = Math.max(8, Math.min(r.left, vw - r.width - 8));
    setPos({ top: place === "bottom" ? r.bottom + window.scrollY : r.top + window.scrollY, left: left + window.scrollX, width: r.width, place });
  }, [maxHeight]);

  useEffect(() => {
    if (!open) return;
    computePosition();
    const fn = () => computePosition();
    window.addEventListener("scroll", fn, true);
    window.addEventListener("resize", fn);
    return () => {
      window.removeEventListener("scroll", fn, true);
      window.removeEventListener("resize", fn);
    };
  }, [open, computePosition]);

  // Cerrar al hacer click fuera (mousedown/touchstart)
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e) => {
      const inBtn = btnRef.current?.contains(e.target);
      const inPop = popRef.current?.contains(e.target);
      if (!inBtn && !inPop) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("touchstart", onDocDown, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("touchstart", onDocDown, true);
    };
  }, [open]);

  // Auto-scroll del item enfocado
  useEffect(() => {
    if (!open || focusIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${focusIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  // ===== Navegación por teclado (incluye typeahead) =====
  const typeBuf = useRef("");
  const typeTimer = useRef(null);
  const moveFocus = (dir) => {
    setFocusIdx((i) => {
      if (normalized.length === 0) return -1;
      const start = i < 0 ? (dir > 0 ? -1 : 0) : i;
      let next = start;
      do {
        next = dir > 0 ? (next + 1) % normalized.length : (next - 1 + normalized.length) % normalized.length;
        // si hay opciones deshabilitables, aquí filtrar
        return next;
      } while (next !== start);
    });
  };

  const commit = (idx) => {
    const opt = normalized[idx];
    if (!opt) return;
    onChange?.(opt.value);
    closePanel();
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openPanel();
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setFocusIdx(Math.max(0, normalized.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (focusIdx >= 0) commit(focusIdx);
      return;
    }
    // Typeahead: juntar letras rápidas y buscar label que comience por el buffer
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      clearTimeout(typeTimer.current);
      typeBuf.current += ch;
      const buf = typeBuf.current;
      const start = Math.max(focusIdx, 0);
      const idx1 = normalized.findIndex((o, i) => i >= start && o._label.toLowerCase().startsWith(buf));
      const idx2 = normalized.findIndex((o, i) => i < start && o._label.toLowerCase().startsWith(buf));
      const hit = idx1 !== -1 ? idx1 : idx2;
      if (hit !== -1) setFocusIdx(hit);
      typeTimer.current = setTimeout(() => (typeBuf.current = ""), 450);
    }
  };

  // Abrir/cerrar con click del botón
  const onTriggerClick = () => {
    if (disabled) return;
    if (open) closePanel();
    else openPanel();
  };

  // ARIA active descendant
  const activeDesc = open && focusIdx >= 0 ? optionId(focusIdx) : undefined;

  // Popover JSX
  const popover = open ? (
    <div
      ref={popRef}
      className={`fs-popover ${pos.place}`}
      id={listboxId}
      role="listbox"
      style={{
        position: "absolute",
        top: pos.top + (pos.place === "bottom" ? 4 : -4),
        left: pos.left,
        width: pos.width,
        maxHeight,
        zIndex: 1000,
      }}
    >
      <ul ref={listRef}>
        {normalized.map((o, idx) => {
          const selected = idx === curIdx;
          const focused = idx === focusIdx;
          return (
            <li
              key={o._value}
              id={optionId(idx)}
              role="option"
              aria-selected={selected}
              data-idx={idx}
              className={`fs-option ${selected ? "is-selected" : ""} ${focused ? "is-focused" : ""}`}
              title={o._label}
              onMouseEnter={() => setFocusIdx(idx)}
              onMouseDown={(e) => e.preventDefault()} // evita blur antes del click
              onClick={() => commit(idx)}
            >
              <span className="fs-option-label">{o._label}</span>
              {selected && <span className="fs-check" aria-hidden>✓</span>}
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  return (
    <div
      className={`fancy-select ${disabled ? "is-disabled" : ""} ${className}`}
      onKeyDown={onKeyDown}
      // combobox para screen readers
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-activedescendant={activeDesc}
    >
      <button
        ref={btnRef}
        type="button"
        className={`fs-trigger ${open ? "is-open" : ""}`}
        disabled={disabled}
        onClick={onTriggerClick}
      >
        <span className={`fs-value ${current ? "" : "is-placeholder"}`}>
          {current?._label ?? placeholder}
        </span>
        <svg className="fs-caret" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Portal para el popover (mejor stacking/position) */}
      {open && ReactDOM.createPortal(popover, portalRoot)}
    </div>
  );
}
