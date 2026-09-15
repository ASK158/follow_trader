"use client";

import { useEffect, useRef } from "react";

interface Particle {
  angle: number;
  dist: number;
  baseDist: number;
  size: number;
  alpha: number;
  color: string;
  orbitSpeed: number;
  phaseOffset: number;
  tilt: number;
  x: number;
  y: number;
}

export function QuantVisualCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // Warm technical color palette: Red accents, warm muted browns, soft rose
    const palette = [
      "rgba(198, 106, 118, ", // tech-red (#c66a76)
      "rgba(164, 77, 89, ",   // tech-red-dark (#a44d59)
      "rgba(136, 127, 118, ", // tech-muted (#887f76)
      "rgba(216, 173, 179, ", // soft rose (#d8adb3)
      "rgba(189, 105, 117, ", // geo-accent (#bd6975)
    ];

    const PARTICLE_COUNT = 90;
    const particles: Particle[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
      const baseDist = 30 + Math.random() * 260;
      particles.push({
        angle,
        dist: baseDist,
        baseDist,
        size: 1.2 + Math.random() * 2.2,
        alpha: 0.25 + Math.random() * 0.55,
        color: palette[Math.floor(Math.random() * palette.length)],
        orbitSpeed: (Math.random() - 0.5) * 0.0035,
        phaseOffset: Math.random() * Math.PI * 2,
        tilt: 0.52 + Math.random() * 0.16, // perspective tilt
        x: 0,
        y: 0,
      });
    }

    let time = 0;

    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // Focus core anchor towards the right on wider screens so it acts as dynamic visual hero
      const cx = width > 768 ? width * 0.72 : width * 0.55;
      const cy = height * 0.5;

      const cycleTime = time * 0.012;
      // wave fluctuates between -1 (aggregated/converged) and 1 (dispersed/expanded)
      const wave = Math.sin(cycleTime * 0.85);
      const pulse = Math.cos(cycleTime * 1.7) * 0.12;

      // 1. Concentric radar rings (pulsing outwards)
      const ringCount = 4;
      for (let r = 1; r <= ringCount; r++) {
        const ringProgress = (cycleTime * 0.35 + r / ringCount) % 1;
        const radius = 25 + ringProgress * 230;
        const ringAlpha = (1 - ringProgress) * 0.18;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radius * 0.58, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(198, 106, 118, ${ringAlpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 2. Core beacon
      const corePulse = 0.5 + 0.5 * Math.sin(cycleTime * 2);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
      gradient.addColorStop(0, `rgba(198, 106, 118, ${0.28 + corePulse * 0.18})`);
      gradient.addColorStop(0.4, "rgba(216, 173, 179, 0.1)");
      gradient.addColorStop(1, "rgba(255, 253, 249, 0)");

      ctx.beginPath();
      ctx.arc(cx, cy, 70, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Core anchor point
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(164, 77, 89, 0.75)";
      ctx.fill();

      // 3. Update particle coordinates based on aggregation & dispersion
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.angle += p.orbitSpeed;

        // Dynamic distance from center: creates expansion and aggregation
        const dispersion = (wave + pulse) * 70;
        const currentDist = Math.max(
          18,
          p.baseDist + dispersion + Math.sin(cycleTime * 1.5 + p.phaseOffset) * 22
        );

        p.x = cx + Math.cos(p.angle) * currentDist;
        p.y = cy + Math.sin(p.angle) * (currentDist * p.tilt);
      }

      // 4. Connecting dynamic curves (neural lattice / aggregation curves)
      const maxConnDist = 72;
      ctx.lineWidth = 0.85;

      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        let connections = 0;

        for (let j = i + 1; j < particles.length; j++) {
          if (connections >= 3) break;
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < maxConnDist) {
            connections++;
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const bendFactor = ((wave + 1) * 0.12) * (j % 2 === 0 ? 1 : -1);
            const ctrlX = midX + (midY - cy) * bendFactor;
            const ctrlY = midY - (midX - cx) * bendFactor;

            const lineAlpha =
              (1 - dist / maxConnDist) *
              0.22 *
              (0.6 + 0.4 * Math.sin(cycleTime + p1.phaseOffset));

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y);
            ctx.strokeStyle = `rgba(189, 105, 117, ${lineAlpha})`;
            ctx.stroke();
          }
        }

        // Faint central flux lines
        const distFromCenter = Math.hypot(p1.x - cx, p1.y - cy);
        if (distFromCenter < 120 && i % 3 === 0) {
          const rayAlpha = (1 - distFromCenter / 120) * 0.12;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `rgba(198, 106, 118, ${rayAlpha})`;
          ctx.stroke();
        }
      }

      // 5. Draw particles (dots)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dynamicAlpha = Math.min(
          1,
          Math.max(0.12, p.alpha * (0.7 + 0.3 * Math.sin(cycleTime * 2.5 + p.phaseOffset)))
        );

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${dynamicAlpha})`;
        ctx.fill();

        // Extra halo for highlight particles
        if (i % 8 === 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}${dynamicAlpha * 0.25})`;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-ambient-canvas"
      aria-hidden="true"
    />
  );
}
