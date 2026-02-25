"use client";

import { useEffect, useRef } from "react";

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseOpacity: number;
  phase: number;
  phaseSpeed: number;
}

const COUNT = 28;
const NAV_H = 78;

export default function Fireflies() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flies = useRef<Firefly[]>([]);
  const raf = useRef(0);
  const mouse = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    function resize() {
      cvs!.width = window.innerWidth;
      cvs!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function contentBounds() {
      const vw = window.innerWidth;
      const w = Math.min(1480, vw * 0.96);
      const left = (vw - w) / 2;
      return { left, right: left + w };
    }

    // Track cursor — only attract when in the empty side margins
    function onMouseMove(e: MouseEvent) {
      const bounds = contentBounds();
      const inMargin = e.clientX < bounds.left || e.clientX > bounds.right;
      mouse.current = { x: e.clientX, y: e.clientY, active: inMargin && e.clientY > NAV_H };
    }
    function onMouseLeave() {
      mouse.current.active = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);

    // Seed fireflies
    flies.current = Array.from({ length: COUNT }, () => ({
      x: Math.random() * cvs.width,
      y: NAV_H + Math.random() * (cvs.height - NAV_H),
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: 2.5 + Math.random() * 2.5,
      baseOpacity: 0.45 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.004 + Math.random() * 0.012,
    }));

    function tick() {
      if (!ctx || !cvs) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      const bounds = contentBounds();

      for (const f of flies.current) {
        f.phase += f.phaseSpeed;

        // Gentle wandering acceleration
        f.vx += (Math.random() - 0.5) * 0.015;
        f.vy += (Math.random() - 0.5) * 0.015;

        // Attract toward cursor when it's in the empty side margins
        if (mouse.current.active) {
          const dx = mouse.current.x - f.x;
          const dy = mouse.current.y - f.y;
          const dist = Math.hypot(dx, dy) || 1;
          const strength = 0.03 / (1 + dist * 0.005);
          f.vx += (dx / dist) * strength;
          f.vy += (dy / dist) * strength;
        }

        f.vx *= 0.995;
        f.vy *= 0.995;

        // Clamp speed
        const spd = Math.hypot(f.vx, f.vy);
        if (spd > 0.7) {
          f.vx = (f.vx / spd) * 0.7;
          f.vy = (f.vy / spd) * 0.7;
        }

        f.x += f.vx;
        f.y += f.vy;

        // Soft bounce
        if (f.x < 0) { f.x = 0; f.vx = Math.abs(f.vx); }
        if (f.x > cvs.width) { f.x = cvs.width; f.vx = -Math.abs(f.vx); }
        if (f.y < NAV_H) { f.y = NAV_H; f.vy = Math.abs(f.vy); }
        if (f.y > cvs.height) { f.y = cvs.height; f.vy = -Math.abs(f.vy); }

        // Pulse opacity
        const pulse = 0.5 + 0.5 * Math.sin(f.phase);
        let alpha = f.baseOpacity * (0.35 + 0.65 * pulse);

        // Fade inside content area (smooth 80px transition at edges)
        if (f.x >= bounds.left && f.x <= bounds.right) {
          const edge = Math.min(f.x - bounds.left, bounds.right - f.x);
          const margin = 80;
          const factor = edge < margin ? 1 - (edge / margin) * 0.6 : 0.4;
          alpha *= factor;
        }

        // Outer glow
        const gr = f.size * 10;
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, gr);
        glow.addColorStop(0, `rgba(242, 184, 7, ${alpha})`);
        glow.addColorStop(0.08, `rgba(242, 184, 7, ${alpha * 0.7})`);
        glow.addColorStop(0.35, `rgba(240, 165, 0, ${alpha * 0.18})`);
        glow.addColorStop(1, "rgba(240, 165, 0, 0)");
        ctx.beginPath();
        ctx.arc(f.x, f.y, gr, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Bright core
        const core = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size);
        core.addColorStop(0, `rgba(255, 230, 60, ${alpha})`);
        core.addColorStop(1, `rgba(242, 184, 7, ${alpha * 0.5})`);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();
      }

      raf.current = requestAnimationFrame(tick);
    }

    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 1,
      }}
    />
  );
}
