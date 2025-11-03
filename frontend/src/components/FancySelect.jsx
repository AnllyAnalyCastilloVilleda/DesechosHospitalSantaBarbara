import React, {useEffect, useMemo, useRef, useState} from "react";

export default function FancySelect({
  options = [],          // [{ value, label }]
  value,
  onChange,
  placeholder = "Selecciona…",
  disabled = false,
  className = "",
  maxHeight = 280,       // alto del panel
}) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  const current = useMemo(
    () => options.find(o => String(o.value) === String(value)),
    [options, value]
  );

  const toggle = () => !disabled && setOpen(o => !o);
  const close  = () => setOpen(false);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!btnRef.current) return;
      if (!btnRef.current.closest(".fancy-select")?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Teclado
  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")){
      e.preventDefault(); setOpen(true); setFocusIdx(Math.max(0, options.findIndex(o => String(o.value)===String(value))));
      return;
    }
    if (!open) return;

    if (e.key === "Escape") { e.preventDefault(); close(); btnRef.current?.focus(); }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx(i => Math.min(options.length - 1, (i < 0 ? 0 : i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx(i => Math.max(0, (i < 0 ? 0 : i - 1)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[focusIdx];
      if (opt) { onChange?.(opt.value); close(); btnRef.current?.focus(); }
    }
  };

  // Auto-scroll del item enfocado
  useEffect(() => {
    if (!open || focusIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${focusIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [focusIdx, open]);

  return (
    <div className={`fancy-select ${disabled ? "is-disabled" : ""} ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={btnRef}
        className={`fs-trigger ${open ? "is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        <span className={`fs-value ${current ? "" : "is-placeholder"}`}>
          {current?.label ?? placeholder}
        </span>
        <svg className="fs-caret" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="fs-popover" role="listbox" style={{ maxHeight }}>
          <ul ref={listRef}>
            {options.map((o, idx) => {
              const selected = String(o.value) === String(value);
              const focused  = idx === focusIdx;
              return (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={selected}
                  data-idx={idx}
                  className={`fs-option ${selected ? "is-selected" : ""} ${focused ? "is-focused" : ""}`}
                  onMouseEnter={() => setFocusIdx(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange?.(o.value); close(); btnRef.current?.focus(); }}
                  title={o.label}
                >
                  <span className="fs-option-label">{o.label}</span>
                  {selected && <span className="fs-check">✓</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
