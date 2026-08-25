"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  blendProfiles,
  orbColour,
  orbProfile,
  type OrbProfile,
  type OrbState,
} from "./profile";

/**
 * Observer, embodied.
 *
 * A translucent field with a synthetic iris at its centre, drawn on a canvas.
 * Everything is generated per frame from the current state — there is no video,
 * no sprite sheet and no animation library, so the thing on screen is always a
 * statement about what the application is actually doing.
 *
 * Canvas 2D rather than WebGL. At the size this is drawn the cost is a few
 * hundred arcs a frame, and the fallback story is simply "draw one frame" —
 * where a shader would need a context-loss path, a compile-failure path and a
 * software-rendering path to say the same thing.
 *
 * The layers, outward from the middle:
 *
 *   pupil       a dark aperture that narrows when Observer is concentrating
 *   iris        radial fibres and segmented rings, abstract rather than ocular
 *   waveform    a closed ring displaced by frequency data, never bars
 *   filaments   fine orbiting arcs, the sense of something running
 *   shell       a rim-lit sphere, which is what makes it read as volume
 *   atmosphere  a soft field that breathes
 */

const TAU = Math.PI * 2;

/** Fixed so the texture is the same on every machine and every screenshot. */
function seeded(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

interface Filament {
  readonly radius: number;
  readonly start: number;
  readonly sweep: number;
  readonly speed: number;
  readonly weight: number;
}

const FILAMENTS: readonly Filament[] = Array.from({ length: 34 }, (_, i) => ({
  radius: 0.62 + seeded(i) * 0.3,
  start: seeded(i + 90) * TAU,
  sweep: 0.18 + seeded(i + 30) * 1.5,
  speed: (0.4 + seeded(i + 60) * 1.5) * (seeded(i + 120) > 0.42 ? 1 : -0.55),
  weight: 0.4 + seeded(i + 150) * 1.1,
}));

const MOTES: readonly { r: number; a: number; speed: number; size: number }[] = Array.from(
  { length: 26 },
  (_, i) => ({
    r: 0.72 + seeded(i + 7) * 0.5,
    a: seeded(i + 17) * TAU,
    speed: (0.08 + seeded(i + 27) * 0.3) * (seeded(i + 37) > 0.5 ? 1 : -1),
    size: 0.4 + seeded(i + 47) * 1.1,
  }),
);

const FIBRES = 132;

function draw(
  ctx: CanvasRenderingContext2D,
  size: number,
  p: OrbProfile,
  time: number,
  energy: number,
  bands: Float32Array | null,
) {
  const c = size / 2;
  const r = size * 0.29;
  const { r: cr, g: cg, b: cb } = orbColour(p.warmth, p.saturation);
  const rgb = (a: number) => `rgba(${cr}, ${cg}, ${cb}, ${a})`;
  const white = (a: number) => `rgba(${230 + cr * 0.1}, ${244}, ${255}, ${a})`;

  // One breath drives every slow movement, so the layers stay in sympathy
  // instead of drifting into an incoherent shimmer.
  const breath = Math.sin((time / p.breath) * TAU);
  const pulse = 1 + breath * 0.022;
  const lum = Math.min(1.25, p.luminance * 1.35 * (0.9 + energy * 0.35));

  ctx.clearRect(0, 0, size, size);

  /* --- atmosphere ---------------------------------------------------- */

  /*
   * The field has to reach zero inside the canvas.
   *
   * Filling the square with a gradient whose outer radius exceeded the corner
   * distance left the corners at a tenth of the field's alpha, and the orb sat
   * in a faintly visible box. Capped to the inscribed circle and filled as a
   * circle, so everything past it is genuinely nothing.
   */
  const haloR = r * p.halo * pulse * (1 + energy * 0.12);
  const reach = Math.min(haloR * 1.9, c);
  const halo = ctx.createRadialGradient(c, c, r * 0.5, c, c, reach);
  halo.addColorStop(0, rgb(0.24 * lum));
  halo.addColorStop(0.45, rgb(0.09 * lum));
  halo.addColorStop(1, rgb(0));
  ctx.beginPath();
  ctx.arc(c, c, reach, 0, TAU);
  ctx.fillStyle = halo;
  ctx.fill();

  /* --- motes ---------------------------------------------------------- */

  ctx.globalCompositeOperation = "lighter";
  for (const m of MOTES) {
    const a = m.a + time * m.speed * (1 + energy);
    const rad = r * m.r * (1 + breath * 0.03);
    const x = c + Math.cos(a) * rad;
    const y = c + Math.sin(a) * rad * 0.92;
    ctx.beginPath();
    ctx.arc(x, y, m.size * (size / 320), 0, TAU);
    ctx.fillStyle = rgb(0.42 * lum * (0.4 + 0.6 * Math.abs(Math.sin(a * 2))));
    ctx.fill();
  }

  /* --- filaments ------------------------------------------------------ */

  const lit = Math.round(FILAMENTS.length * p.filaments);
  ctx.lineCap = "round";
  for (let i = 0; i < lit; i += 1) {
    const f = FILAMENTS[i] as Filament;
    const a = f.start + time * f.speed * p.spin * 34;
    ctx.beginPath();
    ctx.arc(c, c, r * f.radius * pulse, a, a + f.sweep);
    ctx.strokeStyle = rgb(0.22 * lum);
    ctx.lineWidth = f.weight * (size / 320);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  /* --- the shell ------------------------------------------------------ */

  const shell = ctx.createRadialGradient(
    c - r * 0.28,
    c - r * 0.34,
    r * 0.08,
    c,
    c,
    r * 1.02 * pulse,
  );
  /*
   * Glass, not paint.
   *
   * The first version filled the sphere at nearly full opacity, which buried
   * the filaments and the atmosphere drawn underneath it and left a flat disc.
   * The shell now only tints and shades — the volume comes from the gradient's
   * offset centre and from the rim, not from hiding what is behind it.
   */
  shell.addColorStop(0, rgb(0.18 * lum));
  shell.addColorStop(0.5, `rgba(8, 14, 22, 0.2)`);
  shell.addColorStop(0.88, `rgba(5, 9, 15, 0.34)`);
  shell.addColorStop(1, rgb(0.16 * lum));
  ctx.beginPath();
  ctx.arc(c, c, r * pulse, 0, TAU);
  ctx.fillStyle = shell;
  ctx.fill();

  // An inner bloom, offset towards the light, so the sphere has an inside.
  ctx.globalCompositeOperation = "lighter";
  const bloom = ctx.createRadialGradient(
    c - r * 0.16,
    c - r * 0.2,
    0,
    c - r * 0.16,
    c - r * 0.2,
    r * 0.95,
  );
  bloom.addColorStop(0, rgb(0.2 * lum));
  bloom.addColorStop(0.6, rgb(0.06 * lum));
  bloom.addColorStop(1, rgb(0));
  ctx.beginPath();
  ctx.arc(c, c, r * pulse, 0, TAU);
  ctx.fillStyle = bloom;
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // The rim light is the whole reason this reads as a sphere rather than a
  // disc, so it is drawn as an arc of varying alpha rather than a stroke.
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i += 1) {
    const a = (i / 90) * TAU;
    const facing = Math.cos(a - Math.PI * 1.25);
    if (facing <= 0) continue;
    ctx.beginPath();
    ctx.arc(c, c, r * pulse, a, a + TAU / 90 + 0.02);
    ctx.strokeStyle = white(0.5 * facing * facing * lum);
    ctx.lineWidth = 2 * (size / 320);
    ctx.stroke();
  }

  /* --- the waveform --------------------------------------------------- */

  /*
   * A displaced ring, not a row of bars.
   *
   * The radius at each angle is pushed out by that angle's band, so sound
   * deforms the iris rather than sitting in front of it. Mirrored across the
   * vertical so the shape stays balanced when the spectrum is lopsided.
   */
  const waveR = r * 0.6;
  const amp = r * p.wave * (0.6 + energy * 0.9);
  ctx.beginPath();
  for (let i = 0; i <= 180; i += 1) {
    const t = i / 180;
    const a = t * TAU - Math.PI / 2;
    const mirrored = t <= 0.5 ? t * 2 : (1 - t) * 2;
    const band =
      bands === null || bands.length === 0
        ? Math.sin(mirrored * 9 + time * 5.5) * 0.5 + Math.sin(mirrored * 17 - time * 3.1) * 0.5
        : (bands[Math.min(bands.length - 1, Math.floor(mirrored * bands.length))] ?? 0) * 2 - 1;
    const rad = waveR + band * amp + breath * r * 0.008;
    const x = c + Math.cos(a) * rad;
    const y = c + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = rgb(0.75 * lum);
  ctx.lineWidth = 1.6 * (size / 320);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  /* --- the iris -------------------------------------------------------- */

  const pupilR = r * (0.1 + (1 - p.aperture) * 0.13);
  const irisR = r * 0.55;

  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, irisR, 0, TAU);
  ctx.clip();

  const irisBed = ctx.createRadialGradient(c, c, pupilR * 0.6, c, c, irisR);
  irisBed.addColorStop(0, "rgba(4, 8, 13, 0.7)");
  irisBed.addColorStop(0.5, rgb(0.2 * lum));
  irisBed.addColorStop(1, rgb(0.4 * lum));
  ctx.fillStyle = irisBed;
  ctx.fillRect(c - irisR, c - irisR, irisR * 2, irisR * 2);

  // Radial fibres. Abstract on purpose: even lengths and even spacing would
  // read as a gear, uneven ones as an eye, and this sits between the two.
  ctx.globalCompositeOperation = "lighter";
  const twist = time * p.spin * 2.4;
  for (let i = 0; i < FIBRES; i += 1) {
    const t = i / FIBRES;
    const a = t * TAU + twist;
    const jitter = seeded(i * 3.7);
    const inner = pupilR * (1.02 + jitter * 0.12);
    const outer = irisR * (0.72 + jitter * 0.3);
    const flicker = 0.5 + 0.5 * Math.sin(time * 2.2 + jitter * 12);
    /*
     * Brightness varies in slow bands around the circle.
     *
     * Evenly lit fibres read as a turbine. Two low-frequency waves over the
     * angle gather them into drifting clusters, which is what makes the iris
     * look like energy organising itself rather than a machined part.
     */
    const cluster =
      0.35 +
      0.65 *
        Math.abs(Math.sin(a * 1.5 + time * 0.35) * 0.6 + Math.sin(a * 3.5 - time * 0.22) * 0.4);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.lineTo(c + Math.cos(a) * outer, c + Math.sin(a) * outer);
    ctx.strokeStyle = rgb((0.1 + 0.42 * flicker) * cluster * lum);
    ctx.lineWidth = (0.5 + jitter * 0.9) * (size / 320);
    ctx.stroke();
  }

  // Segmented rings: broken arcs at two radii, counter-rotating.
  for (const [radius, count, speed] of [
    [0.66, 18, 1],
    [0.86, 26, -0.62],
  ] as const) {
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * TAU + time * p.spin * 9 * speed;
      ctx.beginPath();
      ctx.arc(c, c, irisR * radius, a, a + (TAU / count) * 0.5);
      ctx.strokeStyle = rgb(0.45 * lum);
      ctx.lineWidth = 1.2 * (size / 320);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  /* --- the aperture ---------------------------------------------------- */

  /*
   * A lit core inside a dark ring, not a dark pupil with a catchlight.
   *
   * The first version put a black disc in the middle and a white specular dot
   * on its upper left, which is precisely how an eye is drawn — and an eye is
   * the one thing this must not be. Inverting it keeps the sense of a focal
   * point that opens and closes while reading as energy rather than anatomy.
   */
  const ring = ctx.createRadialGradient(c, c, pupilR * 0.55, c, c, pupilR * 1.65);
  ring.addColorStop(0, "rgba(3, 7, 12, 0)");
  ring.addColorStop(0.42, "rgba(3, 7, 12, 0.88)");
  ring.addColorStop(1, "rgba(3, 7, 12, 0)");
  ctx.beginPath();
  ctx.arc(c, c, pupilR * 1.65, 0, TAU);
  ctx.fillStyle = ring;
  ctx.fill();

  ctx.globalCompositeOperation = "lighter";
  const core = ctx.createRadialGradient(c, c, 0, c, c, pupilR * 1.1);
  core.addColorStop(0, white(0.95 * lum));
  core.addColorStop(0.28, rgb(0.85 * lum));
  core.addColorStop(1, rgb(0));
  ctx.beginPath();
  ctx.arc(c, c, pupilR * 1.1, 0, TAU);
  ctx.fillStyle = core;
  ctx.fill();

  // Two short arcs across the core, drifting: the aperture reading as
  // something mechanical opening rather than a bright dot.
  for (const side of [0, Math.PI] as const) {
    const a = side + time * p.spin * 5;
    ctx.beginPath();
    ctx.arc(c, c, pupilR * 1.32, a - 0.55, a + 0.55);
    ctx.strokeStyle = rgb(0.55 * lum);
    ctx.lineWidth = 1.6 * (size / 320);
    ctx.stroke();
  }

  // The iris edge, brightest where the rim light falls.
  ctx.beginPath();
  ctx.arc(c, c, irisR, 0, TAU);
  ctx.strokeStyle = rgb(0.55 * lum);
  ctx.lineWidth = 1.1 * (size / 320);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

export interface ObserverOrbProps {
  readonly state: OrbState;
  /** 0–1. How much is going on: streaming rate, tool depth, input level. */
  readonly intensity?: number;
  /** Live frequency data, 0–1 per band. Only ever real audio, never invented. */
  readonly frequencies?: Float32Array | null;
  readonly size?: number;
  /** Drops the atmosphere so the orb can sit inside a control. */
  readonly compact?: boolean;
  readonly onActivate?: () => void;
  readonly activateLabel?: string;
}

export function ObserverOrb({
  state,
  intensity = 0,
  frequencies = null,
  size = 320,
  compact = false,
  onActivate,
  activateLabel = "Focus the Observer prompt",
}: ObserverOrbProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState(false);

  // The animated values live in a ref: a state update per frame would rerender
  // the tree sixty times a second to move a pixel inside a canvas.
  const target = useRef(state);
  const shown = useRef<OrbProfile>(orbProfile(state));
  const level = useRef(intensity);
  const bands = useRef<Float32Array | null>(frequencies);

  target.current = state;
  level.current = intensity;
  bands.current = frequencies;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const ctx = element.getContext("2d");
    if (ctx === null) return;

    // Sharp on a 1× panel and on a 2× one, capped so a 3× phone does not pay
    // for nine times the fill rate to draw the same 96px circle.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    element.width = size * dpr;
    element.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /*
     * Reduced motion draws one frame and stops.
     *
     * Not a still of the idle state — the state's own frame, so colour,
     * luminance and aperture still carry which state Observer is in. The words
     * beside the orb carry it too; neither depends on movement.
     */
    if (reduced) {
      shown.current = orbProfile(target.current);
      draw(ctx, size, shown.current, 0, 0, null);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;

      // Cross-fade towards the current state at a fixed rate, so a transition
      // takes the same time however far apart the two states look.
      shown.current = blendProfiles(shown.current, orbProfile(target.current), dt * 3.2);
      draw(ctx, size, shown.current, clock, Math.min(1, Math.max(0, level.current)), bands.current);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      // Both, deliberately: cancelling alone leaves a frame already queued to
      // run once against a canvas whose component has gone.
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [reduced, size]);

  const profile = orbProfile(state);
  const body = (
    <>
      {/*
        * The drawn size is a variable, not an inline width.
        *
        * The canvas keeps its own backing-store resolution, but how large it is
        * on the page has to be something a media query can answer: at 330px on
        * a phone the orb filled the first screen and pushed the prompt below
        * the fold, which is the one thing this composition must not do.
        */}
      <canvas
        ref={canvas}
        className="obs-orb-canvas"
        style={{ "--orb-size": `${size}px` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className="iris-sr" role="status">
        {profile.label}
      </span>
    </>
  );

  const className = `obs-orb${compact ? " obs-orb--compact" : ""}`;

  if (onActivate === undefined) {
    return (
      <div className={className} data-state={state} role="img" aria-label={profile.label}>
        {body}
      </div>
    );
  }

  return (
    <button className={className} data-state={state} type="button" onClick={onActivate}>
      {body}
      <span className="iris-sr">{activateLabel}</span>
    </button>
  );
}
