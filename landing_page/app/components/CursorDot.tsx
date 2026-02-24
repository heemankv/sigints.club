"use client";

import { useEffect, useRef } from "react";

export default function CursorDot() {
  const dotRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -100, y: -100 });
  const pos = useRef({ x: -100, y: -100 });
  const visible = useRef(false);
  const rafRef = useRef<number>();

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>(".hero-fullscreen");
    if (!hero) return;

    const onEnter = () => {
      visible.current = true;
      if (dotRef.current) dotRef.current.style.opacity = "1";
    };
    const onLeave = () => {
      visible.current = false;
      if (dotRef.current) dotRef.current.style.opacity = "0";
    };
    const onMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    hero.addEventListener("mouseenter", onEnter);
    hero.addEventListener("mouseleave", onLeave);
    hero.addEventListener("mousemove", onMove);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const tick = () => {
      pos.current.x = lerp(pos.current.x, mouse.current.x, 0.09);
      pos.current.y = lerp(pos.current.y, mouse.current.y, 0.09);
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x - 5}px, ${pos.current.y - 5}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      hero.removeEventListener("mouseenter", onEnter);
      hero.removeEventListener("mouseleave", onLeave);
      hero.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: "#F5C000",
        boxShadow: "0 0 10px 5px rgba(245,192,0,0.65), 0 0 3px 2px rgba(245,192,0,0.9)",
        pointerEvents: "none",
        opacity: 0,
        transition: "opacity 0.2s ease",
        zIndex: 20,
      }}
    />
  );
}
