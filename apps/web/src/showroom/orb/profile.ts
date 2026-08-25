/**
 * What each Observer state looks like.
 *
 * Kept separate from the canvas because this is the part that carries meaning:
 * a reader learns that the aperture narrows when Observer is working and that
 * the field expands when it has found something, and that has to be a stable
 * mapping rather than a number picked while tuning an animation.
 *
 * Pure and dependency-free, so the state machine is testable without a browser.
 */

export const ORB_STATES = [
  "idle",
  "attention",
  "listening",
  "thinking",
  "speaking",
  "insight",
  "success",
  "unavailable",
] as const;

export type OrbState = (typeof ORB_STATES)[number];

export interface OrbProfile {
  /**
   * How open the aperture is, 0 closed and 1 wide.
   *
   * Narrow reads as concentrating and wide as taking in — the opposite of a
   * camera, and the right way round for something that is paying attention.
   */
  readonly aperture: number;
  /** Radius of the outer atmosphere, as a multiple of the orb. */
  readonly halo: number;
  /** How bright the iris fibres burn, 0–1. */
  readonly luminance: number;
  /** Amplitude of the waveform ring, as a fraction of the orb radius. */
  readonly wave: number;
  /** Revolutions per second of the filament layer. Negative turns inward. */
  readonly spin: number;
  /** Seconds for one breath. Larger is calmer. */
  readonly breath: number;
  /** How many filaments are lit. Density reads as effort. */
  readonly filaments: number;
  /** 0 is the deep blue end of the accent, 1 the cyan end. */
  readonly warmth: number;
  /** Drops the whole thing back when there is nothing to say. */
  readonly saturation: number;
  /** What a screen reader is told. */
  readonly label: string;
}

/*
 * Deliberate constraints across the table below.
 *
 * `attention` and `insight` are the only states brighter than idle, and neither
 * pulses more than once per cycle: a presence that flashes is a notification,
 * and a notification that cannot be dismissed is an irritation. `unavailable`
 * desaturates rather than turning red — nothing has gone wrong with the
 * evidence, only with the interpretation of it.
 */
const PROFILES: Readonly<Record<OrbState, OrbProfile>> = {
  idle: {
    aperture: 0.62,
    halo: 1.24,
    luminance: 0.42,
    wave: 0.012,
    spin: 0.014,
    breath: 7.5,
    filaments: 0.55,
    warmth: 0.25,
    saturation: 1,
    label: "Observer is present and idle.",
  },
  attention: {
    aperture: 0.5,
    halo: 1.38,
    luminance: 0.68,
    wave: 0.03,
    spin: 0.022,
    breath: 5,
    filaments: 0.72,
    warmth: 0.42,
    saturation: 1,
    label: "Observer has found something worth reviewing.",
  },
  listening: {
    aperture: 0.42,
    halo: 1.34,
    luminance: 0.78,
    wave: 0.14,
    spin: 0.03,
    breath: 4,
    filaments: 0.8,
    warmth: 0.6,
    saturation: 1,
    label: "Observer is listening. The microphone is on.",
  },
  thinking: {
    // Inward spin and a narrowed aperture: analysis, not a loading spinner.
    aperture: 0.3,
    halo: 1.16,
    luminance: 0.6,
    wave: 0.05,
    spin: -0.075,
    breath: 2.6,
    filaments: 1,
    warmth: 0.35,
    saturation: 1,
    label: "Observer is working through the evidence.",
  },
  speaking: {
    aperture: 0.58,
    halo: 1.3,
    luminance: 0.82,
    wave: 0.11,
    spin: 0.026,
    breath: 3.4,
    filaments: 0.85,
    warmth: 0.66,
    saturation: 1,
    label: "Observer is answering.",
  },
  insight: {
    aperture: 0.78,
    halo: 1.58,
    luminance: 1,
    wave: 0.06,
    spin: 0.018,
    breath: 6,
    filaments: 0.9,
    warmth: 0.78,
    saturation: 1,
    label: "Observer has surfaced an observation.",
  },
  success: {
    aperture: 0.7,
    halo: 1.34,
    luminance: 0.74,
    wave: 0.02,
    spin: 0.012,
    breath: 6.5,
    filaments: 0.62,
    warmth: 0.5,
    saturation: 1,
    label: "Observer has finished.",
  },
  unavailable: {
    aperture: 0.52,
    halo: 1.06,
    luminance: 0.22,
    wave: 0.004,
    spin: 0.006,
    breath: 9,
    filaments: 0.3,
    warmth: 0.1,
    // Quiet, not alarmed. The measured evidence is still there; only the
    // interpretation of it is missing, and red would claim otherwise.
    saturation: 0.18,
    label: "Observer cannot interpret right now. The measured evidence is still available.",
  },
};

export function orbProfile(state: OrbState): OrbProfile {
  return PROFILES[state];
}

/** Every state is reachable and distinguishable. Asserted by the unit suite. */
export function orbStates(): readonly OrbState[] {
  return ORB_STATES;
}

/**
 * Eases one profile towards another.
 *
 * States cross-fade rather than cut, because a presence that snaps between
 * appearances reads as a series of icons rather than as one thing changing its
 * mind. `t` is 0 at the old state and 1 at the new one.
 */
export function blendProfiles(from: OrbProfile, to: OrbProfile, t: number): OrbProfile {
  const k = Math.min(1, Math.max(0, t));
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    aperture: mix(from.aperture, to.aperture),
    halo: mix(from.halo, to.halo),
    luminance: mix(from.luminance, to.luminance),
    wave: mix(from.wave, to.wave),
    spin: mix(from.spin, to.spin),
    breath: mix(from.breath, to.breath),
    filaments: mix(from.filaments, to.filaments),
    warmth: mix(from.warmth, to.warmth),
    saturation: mix(from.saturation, to.saturation),
    // The label is the destination's the moment the transition starts: it
    // describes what Observer is doing, and it is doing the new thing.
    label: to.label,
  };
}

/**
 * The colour of the orb at a given warmth.
 *
 * One hue family — the IRIS accent through cyan — never a rainbow. Returned as
 * components so the canvas can build gradients at any alpha without parsing.
 */
export function orbColour(warmth: number, saturation: number): { r: number; g: number; b: number } {
  const k = Math.min(1, Math.max(0, warmth));
  // #0b6fae → #00a3ff → #6ff2ff, the accent's own dim-to-bright range.
  interface Stop {
    readonly at: number;
    readonly r: number;
    readonly g: number;
    readonly b: number;
  }
  const stops: readonly Stop[] = [
    { at: 0, r: 11, g: 111, b: 174 },
    { at: 0.55, r: 0, g: 163, b: 255 },
    { at: 1, r: 111, g: 242, b: 255 },
  ];

  let lo: Stop = stops[0] as Stop;
  let hi: Stop = stops[stops.length - 1] as Stop;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i] as Stop;
    const b = stops[i + 1] as Stop;
    if (k >= a.at && k <= b.at) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = (k - lo.at) / span;
  const raw = {
    r: lo.r + (hi.r - lo.r) * t,
    g: lo.g + (hi.g - lo.g) * t,
    b: lo.b + (hi.b - lo.b) * t,
  };

  // Desaturation pulls towards the interface's own grey rather than to black,
  // so an unavailable orb reads as dormant instead of as a hole in the page.
  const s = Math.min(1, Math.max(0, saturation));
  const grey = (raw.r + raw.g + raw.b) / 3;
  return {
    r: Math.round(grey + (raw.r - grey) * s),
    g: Math.round(grey + (raw.g - grey) * s),
    b: Math.round(grey + (raw.b - grey) * s),
  };
}
