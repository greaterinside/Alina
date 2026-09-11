"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

// This is a direct port of the particle engine as given — same Fibonacci
// sphere, same spring physics, same colors (no brand palette), same text
// sampling, same cursor-repulsion. The only real changes: it sizes to its
// container instead of the full window, drives the sphere<->text
// transition programmatically (on mount) instead of from a text input,
// and drops the demo-only UI (input box, double-click reset) since this
// runs as a passive background, not an interactive standalone page.
const N = 10000;
const PHI = Math.PI * (1 + Math.sqrt(5));
const FOV = 550;
const CAMERA_Z = 600;
const REPEL_RADIUS = 100; // px — cursor influence radius
const REPEL_FORCE = 8; // strength of repulsion

const WELCOME_TEXT = "Hi, I'm Alina";
const SESSION_KEY = "alina-particle-intro-shown";

export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvasMaybe = canvasRef.current;
    const containerMaybe = containerRef.current;
    if (!canvasMaybe || !containerMaybe) return;
    const ctxMaybe = canvasMaybe.getContext("2d");
    if (!ctxMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;
    const container: HTMLDivElement = containerMaybe;
    const ctx: CanvasRenderingContext2D = ctxMaybe;

    let W = 0;
    let H = 0;
    let CX = 0;
    let CY = 0;
    let dpr = window.devicePixelRatio || 1;

    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const vz = new Float32Array(N);
    const tx = new Float32Array(N);
    const ty = new Float32Array(N);
    const tz = new Float32Array(N);
    const hue = new Float32Array(N);
    const phase = new Float32Array(N);

    // 0 = sphere, 1 = forming/holding text
    let appState: 0 | 1 = 0;
    let t = 0;
    let rotY = 0;
    let raf = 0;
    let mouseX = -9999;
    let mouseY = -9999;
    let particlesSeeded = false;

    function initSphereTargets() {
      const baseDim = Math.min(W, H);
      const R = baseDim > 1200 ? baseDim * 0.28 : baseDim * 0.42;
      for (let i = 0; i < N; i++) {
        const polar = Math.acos(1 - (2 * (i + 0.5)) / N);
        const azim = PHI * i;
        tx[i] = Math.sin(polar) * Math.cos(azim) * R;
        ty[i] = Math.sin(polar) * Math.sin(azim) * R;
        tz[i] = Math.cos(polar) * R;
      }
    }

    function initParticles() {
      for (let i = 0; i < N; i++) {
        px[i] = (Math.random() - 0.5) * W * 2;
        py[i] = (Math.random() - 0.5) * H * 2;
        pz[i] = (Math.random() - 0.5) * 1000;
        hue[i] = (i / N) * 320 + 170;
        phase[i] = Math.random() * Math.PI * 2;
      }
    }

    function resize() {
      dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      CX = W / 2;
      CY = H / 2;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (appState === 0) initSphereTargets();
      if (!particlesSeeded && W > 0 && H > 0) {
        initParticles();
        particlesSeeded = true;
      }
    }

    function sampleTextPositions(phrase: string): number[] {
      const cW = Math.floor(W);
      const cH = Math.floor(H);
      const off = document.createElement("canvas");
      off.width = cW;
      off.height = cH;
      const c2 = off.getContext("2d")!;

      const words = phrase.split(" ");
      const lines: string[] = [];
      let currentLine = "";
      const maxChars = phrase.length > 25 ? 12 : 20;
      words.forEach((word) => {
        if ((currentLine + word).length > maxChars) {
          lines.push(currentLine.trim());
          currentLine = word + " ";
        } else {
          currentLine += word + " ";
        }
      });
      lines.push(currentLine.trim());

      let fs = Math.min((cW * 0.72) / (maxChars * 0.5), (cH * 0.5) / lines.length, 180);
      if (phrase.length > 30) fs *= 0.8;

      c2.fillStyle = "#fff";
      c2.font = `900 ${fs}px Arial Black, Arial, sans-serif`;
      c2.textAlign = "center";
      c2.textBaseline = "middle";

      const lineHeight = fs * 1.1;
      const startY = cH / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => c2.fillText(line, cW / 2, startY + i * lineHeight));

      const data = c2.getImageData(0, 0, cW, cH).data;
      const pts: number[] = [];
      const step = phrase.length > 30 ? 2 : 1;
      for (let y = 0; y < cH; y += step) {
        for (let x = 0; x < cW; x += step) {
          if (data[(y * cW + x) * 4 + 3] > 120) {
            pts.push(x - cW / 2 + (Math.random() - 0.5) * 0.8, y - cH / 2 + (Math.random() - 0.5) * 0.8);
          }
        }
      }
      for (let i = pts.length / 2 - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const ia = i * 2;
        const ja = j * 2;
        let tmp = pts[ia];
        pts[ia] = pts[ja];
        pts[ja] = tmp;
        tmp = pts[ia + 1];
        pts[ia + 1] = pts[ja + 1];
        pts[ja + 1] = tmp;
      }
      return pts;
    }

    function formWord(phrase: string) {
      if (!phrase.trim()) return;
      appState = 1;
      const pts = sampleTextPositions(phrase);
      const pCount = pts.length / 2;
      if (pCount === 0) return;
      for (let i = 0; i < N; i++) {
        const idx = (i % pCount) * 2;
        tx[i] = pts[idx];
        ty[i] = pts[idx + 1];
        tz[i] = 0;
      }
      rotY = 0;
      t = 0;
    }

    function resetToSphere() {
      appState = 0;
      initSphereTargets();
    }

    function update() {
      t += 0.005;
      if (appState === 0) rotY += 0.006;
      const jitter = appState === 0 ? 1.8 : 0;

      for (let i = 0; i < N; i++) {
        const curTx = tx[i];
        const curTy = ty[i];
        const curTz = tz[i];
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        let targetX = curTx * cosY - curTz * sinY;
        let targetY = curTy;
        let targetZ = curTx * sinY + curTz * cosY;
        if (appState === 0) {
          targetX += Math.sin(t * 8 + phase[i]) * jitter;
          targetY += Math.cos(t * 9 + phase[i]) * jitter;
          targetZ += Math.sin(t * 7 + phase[i] * 2) * jitter;
        }
        const sp = appState === 0 ? 0.02 : 0.022;
        vx[i] += (targetX - px[i]) * sp;
        vy[i] += (targetY - py[i]) * sp;
        vz[i] += (targetZ - pz[i]) * sp;

        // Cursor repulsion — same formula as given, just no longer
        // gated to text mode only: the sphere is the persistent state
        // now, so hovering it should distort it too, springing back
        // once the cursor moves away (the spring pull above already
        // does the "back to original shape" part on its own).
        if (mouseX > 0) {
          const scale = FOV / (FOV + pz[i] + CAMERA_Z);
          const sx = px[i] * scale + CX;
          const sy = py[i] * scale + CY;
          const rdx = sx - mouseX;
          const rdy = sy - mouseY;
          const d2 = rdx * rdx + rdy * rdy;
          if (d2 < REPEL_RADIUS * REPEL_RADIUS && d2 > 1) {
            const d = Math.sqrt(d2);
            const mag = REPEL_FORCE * (1 - d / REPEL_RADIUS) * 5;
            vx[i] += (rdx / d) * mag;
            vy[i] += (rdy / d) * mag;
          }
        }

        vx[i] *= 0.82;
        vy[i] *= 0.82;
        vz[i] *= 0.82;
        px[i] += vx[i];
        py[i] += vy[i];
        pz[i] += vz[i];
      }
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "rgba(5,5,15,0.22)";
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < N; i++) {
        const zPos = pz[i] + CAMERA_Z;
        if (zPos < 10) continue;
        const scale = FOV / zPos;
        const sx = px[i] * scale + CX;
        const sy = py[i] * scale + CY;

        const spd = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
        let a = Math.min(1, (0.18 + spd * 0.1) * (scale * 0.65));
        let size = (0.4 + spd * 0.12) * scale;
        let h: number;
        let s: number;
        let l: number;

        if (appState >= 1) {
          h = 190;
          s = 90;
          l = 85;
          a = Math.min(1, a * 1.5);
          size *= 0.9;
        } else {
          h = (hue[i] + t * 25) % 360;
          s = 80;
          l = 70;
        }

        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, 6.2832);
        ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${a})`;
        ctx.fill();
      }
    }

    function loop() {
      update();
      draw();
      raf = requestAnimationFrame(loop);
    }

    resize();
    loop();

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Listened on window, not the container: the chat UI (composer,
    // message cards, topbar) sits visually on top of this canvas across
    // most of the screen, which would swallow a container-level
    // mousemove in all the areas that actually have content. window
    // still receives the move (it bubbles) regardless of which element
    // is topmost, so hovering the sphere anywhere behind the UI works.
    function handleMouseMove(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }
    function handleMouseLeave() {
      mouseX = -9999;
      mouseY = -9999;
    }
    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    let alreadyShown = true;
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      alreadyShown = true;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    if (!alreadyShown) {
      timers.push(setTimeout(() => formWord(WELCOME_TEXT), 700));
      timers.push(
        setTimeout(() => {
          resetToSphere();
          try {
            sessionStorage.setItem(SESSION_KEY, "1");
          } catch {
            // worst case it replays once more this browser
          }
        }, 700 + 2600)
      );
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={containerRef} className={clsx("absolute inset-0 overflow-hidden", className)} aria-hidden>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
