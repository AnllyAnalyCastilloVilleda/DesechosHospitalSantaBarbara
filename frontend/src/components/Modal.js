import React, { useEffect } from "react";
import "./modal.css";

export default function Modal({
  open,
  title = "Confirmar",
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger", // "danger" | "primary" | "success"
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (!open) return;
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onConfirm?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <div className={`modal-icon ${variant}`}>!</div>
          <h3>{title}</h3>
        </div>
        {description && <p className="modal-desc">{description}</p>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>{cancelText}</button>
          <button
            className={`btn ${
              variant === "danger"
                ? "btn-danger"
                : variant === "success"
                ? "btn-success"
                : "btn-primary"
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
