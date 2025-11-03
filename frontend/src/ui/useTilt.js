// src/ui/useTilt.js
import { useEffect } from "react";

export function useTilt(ref, { max = 10, scale = 1.0 } = {}) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotY = (px - 0.5) * (max * 2);
      const rotX = (0.5 - py) * (max * 2);
      el.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`;
    };
    const onLeave = () => {
      el.style.transform = `perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)`;
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [ref, max, scale]);
}
