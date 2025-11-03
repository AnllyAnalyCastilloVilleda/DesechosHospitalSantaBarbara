// src/ui/Modal.jsx
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import "./modal.css";

/**
 * Modal accesible y ligero.
 * Props:
 *  - open: boolean
 *  - title: string | ReactNode
 *  - description?: string | ReactNode
 *  - confirmText?: string
 *  - cancelText?: string
 *  - variant?: "danger" | "primary" | "success"
 *  - onConfirm?: () => void
 *  - onCancel?: () => void
 *  - closeOnOverlay?: boolean (default: true)
 *  - initialFocus?: "confirm" | "cancel" (default: "confirm")
 *  - children?: ReactNode (contenido extra entre header y acciones)
 */
export default function Modal({
  open,
  title = "Confirmar",
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  onConfirm,
  onCancel,
  closeOnOverlay = true,
  initialFocus = "confirm",
  children,
}) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const lastFocusedElRef = useRef(null);
  const cardRef = useRef(null);

  // Bloquea scroll del body y guarda elemento con foco para devolverlo
  useEffect(() => {
    if (!open) return;
    lastFocusedElRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      // Devuelve foco al elemento que lo tenía
      lastFocusedElRef.current?.focus?.();
    };
  }, [open]);

  // Gestión de teclado (ESC cierra, Enter confirma salvo si el foco está en un input/textarea/select)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel?.();
      } else if (e.key === "Enter") {
        const tag = (document.activeElement?.tagName || "").toUpperCase();
        const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable;
        if (!editing) {
          e.preventDefault();
          onConfirm?.();
        }
      } else if (e.key === "Tab") {
        // Focus trap básico
        const focusables = cardRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const list = Array.from(focusables).filter(el => !el.hasAttribute("disabled"));
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel, onConfirm]);

  // Enfoque inicial al abrir
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      (initialFocus === "cancel" ? cancelRef.current : confirmRef.current)?.focus?.();
    }, 10);
    return () => clearTimeout(t);
  }, [open, initialFocus]);

  if (!open) return null;

  // Botón de color por variante
  const btnClass =
    variant === "danger" ? "btn-danger" :
    variant === "success" ? "btn-success" :
    "btn-primary";

  const content = (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onMouseDown={(e) => {
        // Cerrar por clic de overlay (no si el clic empezó dentro del card)
        if (!closeOnOverlay) return;
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div
        ref={cardRef}
        className="modal-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className={`modal-icon ${variant}`} aria-hidden>!</div>
          <h3 id="modal-title">{title}</h3>
        </div>

        {description && <p className="modal-desc">{description}</p>}

        {/* Slot opcional para contenido adicional (formularios, etc.) */}
        {children}

        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="btn btn-ghost"
            onClick={onCancel}
            type="button"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={`btn ${btnClass}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  // Portal al body para evitar issues de stacking context
  return ReactDOM.createPortal(content, document.body);
}
