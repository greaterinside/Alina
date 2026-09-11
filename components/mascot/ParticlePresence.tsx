"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import type { MascotState } from "@/components/mascot/Mascot";

const SIZES = { sm: 40, md: 64, lg: 112, xl: 172 } as const;

/**
 * Per-size particle/edge counts — a hero-sized orb (xl, EmptyState) can
 * afford the full mesh; a 40px loading indicator (sm) would just be a
 * smear of noise at that density, so it gets fewer, larger nodes instead.
 */
const DETAIL: Record<keyof typeof SIZES, { n: number; k: number }> = {
  sm: { n: 45, k: 2 },
  md: { n: 90, k: 2 },
  lg: { n: 180, k: 3 },
  xl: { n: 260, k: 3 },
};

const STATE_PARAMS: Record<MascotState, { rot: number; jitter: number; pulse: number }> = {
  idle: { rot: 0.005, jitter: 1.4, pulse: 0 },
  thinking: { rot: 0.022, jitter: 2.2, pulse: 0 },
  speaking: { rot: 0.008, jitter: 1.5, pulse: 0.1 },
  happy: { rot: 0.014, jitter: 2.6, pulse: 0.16 },
};

const PHI = Math.PI * (1 + Math.sqrt(5));
const FOV = 550;
const CAMERA_Z = 600;

/**
 * Alina's presence — a glowing particle-mesh sphere in Greater Inside's
 * palette (terracotta/plum, not the borrowed teal of the reference this
 * was modeled on), replacing the illustrated mascot PNGs. Ported from a
 * vanilla Canvas2D prototype (see git history / design discussion) built
 * on a Fibonacci-sphere particle layout with a precomputed nearest-
 * neighbor edge graph, rendered with `lighter` composite + shadowBlur for
 * real glow instead of flat dots.
 *
 * `state` drives motion only (rotation speed / jitter / pulse) — changing
 * it does NOT restart the particle simulation, so switching idle ->
 * thinking -> idle doesn't replay the initial "materialize from scatter"
 * formation, only the first mount does.
 */
export function ParticlePresence({
  state = "idle",
  size = "lg",
  className,
}: {
  state?: MascotState;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { n: N, k: K } = DETAIL[size];
    const dpr = window.devicePixelRatio || 1;
    const W = px;
    const H = px;
    const CX = W / 2;
    const CY = H / 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ppx = new Float32Array(N);
    const ppy = new Float32Array(N);
    const ppz = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    const tx = new Float32Array(N);
    const ty = new Float32Array(N);
    const tz = new Float32Array(N);
    const phase = new Float32Array(N);
    let edges: [number, number][] = [];

    const R = Math.min(W, H) * 0.3;
    for (let i = 0; i < N; i++) {
      const polar = Math.acos(1 - (2 * (i + 0.5)) / N);
      const azim = PHI * i;
      tx[i] = Math.sin(polar) * Math.cos(azim) * R;
      ty[i] = Math.sin(polar) * Math.sin(azim) * R;
      tz[i] = Math.cos(polar) * R;
    }
    {
      const seen = new Set<string>();
      for (let i = 0; i < N; i++) {
        const dists: [number, number][] = [];
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const dx = tx[i] - tx[j];
          const dy = ty[i] - ty[j];
          const dz = tz[i] - tz[j];
          dists.push([dx * dx + dy * dy + dz * dz, j]);
        }
        dists.sort((a, b) => a[0] - b[0]);
        for (let k = 0; k < K; k++) {
          const j = dists[k][1];
          const key = i < j ? `${i}_${j}` : `${j}_${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push([i, j]);
          }
        }
      }
    }
    for (let i = 0; i < N; i++) {
      ppx[i] = (Math.random() - 0.5) * W * 2;
      ppy[i] = (Math.random() - 0.5) * H * 2;
      ppz[i] = (Math.random() - 0.5) * 800;
      phase[i] = Math.random() * Math.PI * 2;
    }

    let t = 0;
    let rotY = 0;
    let raf = 0;

    function project(i: number) {
      const zPos = ppz[i] + CAMERA_Z;
      const scale = FOV / zPos;
      return { x: ppx[i] * scale + CX, y: ppy[i] * scale + CY, scale, zPos };
    }

    function update() {
      t += 0.01;
      const p = STATE_PARAMS[stateRef.current];
      rotY += p.rot;
      const pulseScale = 1 + Math.sin(t * 6) * p.pulse;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      for (let i = 0; i < N; i++) {
        let targetX = (tx[i] * cosY - tz[i] * sinY) * pulseScale;
        let targetY = ty[i] * pulseScale;
        let targetZ = (tx[i] * sinY + tz[i] * cosY) * pulseScale;

        targetX += Math.sin(t * 8 + phase[i]) * p.jitter;
        targetY += Math.cos(t * 9 + phase[i]) * p.jitter;
        targetZ += Math.sin(t * 7 + phase[i] * 2) * p.jitter;

        vx[i] += (targetX - ppx[i]) * 0.07;
        vy[i] += (targetY - ppy[i]) * 0.07;
        vz[i] += (targetZ - ppz[i]) * 0.07;
        vx[i] *= 0.8;
        vy[i] *= 0.8;
        vz[i] *= 0.8;
        ppx[i] += vx[i];
        ppy[i] += vy[i];
        ppz[i] += vz[i];
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "rgba(11,32,56,0.35)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      ctx.shadowBlur = 3;
      ctx.shadowColor = "rgba(200,101,61,0.6)";
      for (const [i, j] of edges) {
        const a = project(i);
        const b = project(j);
        if (a.zPos < 10 || b.zPos < 10) continue;
        const avgScale = (a.scale + b.scale) / 2;
        const alpha = Math.max(0, Math.min(0.55, avgScale * 0.5));
        ctx.strokeStyle = `rgba(200,101,61,${alpha})`;
        ctx.lineWidth = Math.max(0.5, avgScale * 0.7);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (let i = 0; i < N; i++) {
        const { x, y, scale, zPos } = project(i);
        if (zPos < 10) continue;
        const depthT = Math.max(0, Math.min(1, (ppz[i] + 300) / 600));
        const size2 = Math.max(0.8, 1.5 * scale);
        const [r, g, b] = depthT > 0.55 ? [240, 166, 121] : [226, 141, 98];
        ctx.shadowBlur = 7 * scale;
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.55 + depthT * 0.4})`;
        ctx.beginPath();
        ctx.arc(x, y, size2, 0, 6.2832);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    }

    function loop() {
      update();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => cancelAnimationFrame(raf);
    // Deliberately mounts once per `size` — `state` is read live via
    // stateRef so switching states doesn't tear down and replay the
    // scatter-to-sphere formation animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, px]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: px, height: px }}
      className={clsx("flex-none rounded-full", className)}
      aria-hidden
    />
  );
}
