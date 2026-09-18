"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { createParticleField, type FieldProfile, type ParticleField } from "./particleField";
import { orbProfile, type OrbState } from "./profile";

/**
 * Observer as a particle field.
 *
 * A second body for the same state machine, drawn as a cloud of points rather
 * than as concentric rings. Takes the props ObserverOrb takes, so the two are
 * interchangeable wherever the orb appears and a reader can compare them
 * without following two different contracts.
 *
 * ## It does not open a microphone
 *
 * Deliberately, and this is the important line in the file. `useObserverVoice`
 * owns the microphone and records the rule the feature depends on: requested on
 * an explicit user action and never before, never on mount, hover or a route
 * change. A component that opened its own stream to animate itself would break
 * that rule quietly and hold a second stream open besides. Loudness arrives
 * here as a number, through `intensity` and `frequencies`, from whatever the
 * voice session is already receiving.
 *
 * ## Fallback
 *
 * WebGL earns its keep here — a thousand additively blended sprites through two
 * blur chains is not a Canvas 2D workload — but the objection recorded in
 * ObserverOrb is answered rather than waved away. If a context cannot be had,
 * or is lost later, a still 2D figure is drawn in its place and the label
 * beside the orb carries the state exactly as it does when motion is reduced.
 */

/**
 * The ten Observer states over the four the field is tuned for.
 *
 * Kept as an explicit table rather than a clever mapping: a reader should be
 * able to see, in one place, that thinking churns and that speaking swells.
 */
const FIELD_FOR: Readonly<Record<OrbState, FieldProfile>> = {
  idle: {
    amp: 0.11,
    freq: 1.25,
    warp: 0.32,
    speed: 0.1,
    spin: 0.02,
    bright: 0.8,
    glow: 0.8,
    grain: 3.15,
  },
  attention: {
    amp: 0.19,
    freq: 1.7,
    warp: 0.55,
    speed: 0.3,
    spin: 0.055,
    bright: 0.98,
    glow: 0.9,
    grain: 3.04,
  },
  listening: {
    amp: 0.19,
    freq: 1.7,
    warp: 0.55,
    speed: 0.3,
    spin: 0.055,
    bright: 1.02,
    glow: 0.94,
    grain: 3.04,
  },
  waiting_for_human: {
    amp: 0.15,
    freq: 1.5,
    warp: 0.45,
    speed: 0.2,
    spin: 0.035,
    bright: 0.88,
    glow: 0.84,
    grain: 3.1,
  },
  thinking: {
    amp: 0.32,
    freq: 2.25,
    warp: 0.95,
    speed: 0.62,
    spin: 0.11,
    bright: 1.06,
    glow: 1.02,
    grain: 2.97,
  },
  contradictory_evidence: {
    amp: 0.34,
    freq: 2.4,
    warp: 1.05,
    speed: 0.7,
    spin: -0.09,
    bright: 1.0,
    glow: 0.98,
    grain: 2.97,
  },
  speaking: {
    amp: 0.44,
    freq: 1.8,
    warp: 0.72,
    speed: 1.05,
    spin: 0.07,
    bright: 1.24,
    glow: 1.12,
    grain: 3.1,
  },
  insight: {
    amp: 0.4,
    freq: 1.9,
    warp: 0.8,
    speed: 0.8,
    spin: 0.09,
    bright: 1.3,
    glow: 1.2,
    grain: 3.1,
  },
  success: {
    amp: 0.3,
    freq: 1.6,
    warp: 0.6,
    speed: 0.5,
    spin: 0.06,
    bright: 1.2,
    glow: 1.1,
    grain: 3.1,
  },
  error: {
    amp: 0.24,
    freq: 2.6,
    warp: 1.1,
    speed: 0.45,
    spin: -0.05,
    bright: 0.9,
    glow: 0.86,
    grain: 3.04,
  },
};

const KEYS = ["amp", "freq", "warp", "speed", "spin", "bright", "glow", "grain"] as const;

function blendFields(from: FieldProfile, to: FieldProfile, k: number): FieldProfile {
  const t = Math.min(1, Math.max(0, k));
  const out = {} as Record<(typeof KEYS)[number], number>;
  for (const key of KEYS) out[key] = from[key] + (to[key] - from[key]) * t;
  return out as FieldProfile;
}

/** Root-mean-square of the band data, which is the loudness the pulse wants. */
function levelOf(bands: Float32Array | null, fallback: number): number {
  if (bands === null || bands.length === 0) return fallback;
  let sum = 0;
  for (let i = 0; i < bands.length; i++) {
    const v = bands[i] ?? 0;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / bands.length));
}

/** A still figure for when WebGL is unavailable, reduced motion, or context loss. */
function drawStill(ctx: CanvasRenderingContext2D, size: number, profile: FieldProfile): void {
  const r = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(r, r);
  const GA = Math.PI * (3 - Math.sqrt(5));
  const n = 260;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GA * i;
    const x = Math.cos(th) * ring;
    const z = Math.sin(th) * ring;
    const depth = (z + 1) / 2;
    ctx.globalAlpha = (0.18 + 0.5 * depth) * profile.bright;
    ctx.fillStyle = "#cfe0f2";
    ctx.beginPath();
    ctx.arc(
      x * r * 0.72,
      y * r * 0.72,
      Math.max(0.5, (profile.grain / 3) * (0.5 + depth * 0.6)),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

export interface ParticleOrbProps {
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

export function ParticleOrb({
  state,
  intensity = 0,
  frequencies = null,
  size = 60,
  compact = false,
  onActivate,
  activateLabel = "Focus the Observer prompt",
}: ParticleOrbProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState(false);

  // Animated values live in refs: a state update per frame would rerender the
  // tree sixty times a second to move a pixel inside a canvas.
  const target = useRef(state);
  const shown = useRef<FieldProfile>(FIELD_FOR[state]);
  const level = useRef(intensity);
  const bands = useRef<Float32Array | null>(frequencies);
  const pulse = useRef(0);
  const voice = useRef(0);
  const prox = useRef(0);
  const aim = useRef<[number, number]>([1, 0]);
  const pointer = useRef<{ x: number; y: number; at: number }>({ x: 0, y: 0, at: -1e9 });

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

    const still = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      element.width = size * dpr;
      element.height = size * dpr;
      const ctx = element.getContext("2d");
      if (ctx === null) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStill(ctx, size, FIELD_FOR[target.current]);
    };

    if (reduced) {
      still();
      return;
    }

    let field: ParticleField | null = null;
    try {
      field = createParticleField(element, size);
    } catch {
      field = null;
    }
    if (field === null) {
      still();
      return;
    }

    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, at: performance.now() };
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = performance.now();
    let running = true;
    let rect = element.getBoundingClientRect();
    let rectAt = 0;

    const frame = (now: number) => {
      if (!running) return;
      if (!field!.ok) {
        // Context lost. Stop, and leave a still figure rather than a blank hole.
        running = false;
        still();
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (now - rectAt > 400) {
        rect = element.getBoundingClientRect();
        rectAt = now;
      }

      // Pointer proximity, scaled to the mark so a 38px orb is not swamped by a
      // radius meant for a large one.
      const p = pointer.current;
      if (p.at > 0 && now - p.at < 4000 && rect.width > 0) {
        const dx = p.x - (rect.left + rect.width / 2);
        const dy = p.y - (rect.top + rect.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const halo = rect.width * 1.6 + 88;
        const u = Math.max(0, 1 - d / halo);
        const wanted = u * u * (3 - 2 * u);
        prox.current += (wanted - prox.current) * (1 - Math.pow(0.0006, dt));
        aim.current = [dx / d, -dy / d];
      } else {
        prox.current += (0 - prox.current) * (1 - Math.pow(0.0006, dt));
      }

      // Loudness comes from props. Two envelopes: fast for the pulse, slow for
      // the breath, so a reply reads as speech rather than as a flicker.
      const loud = levelOf(bands.current, Math.min(1, Math.max(0, level.current)));
      const kf = 1 - Math.pow(loud > pulse.current ? 1e-6 : 0.02, dt);
      pulse.current += (loud - pulse.current) * kf;
      const ks = 1 - Math.pow(loud > voice.current ? 0.004 : 0.55, dt);
      voice.current += (loud - voice.current) * ks;

      shown.current = blendFields(shown.current, FIELD_FOR[target.current], dt * 3.2);
      field!.frame(dt, {
        profile: shown.current,
        pulse: pulse.current,
        voice: voice.current,
        prox: prox.current,
        aimX: aim.current[0],
        aimY: aim.current[1],
      });
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      // Both, deliberately: cancelling alone leaves a frame already queued to
      // run once against a canvas whose component has gone.
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      field?.dispose();
    };
  }, [reduced, size]);

  const profile = orbProfile(state);
  const body = (
    <>
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
