import { describe, expect, it } from "vitest";
import {
  ORB_STATES,
  blendProfiles,
  orbColour,
  orbProfile,
  type OrbState,
} from "../src/showroom/orb/profile";

/**
 * Observer's states, as a contract rather than as a look.
 *
 * The orb is the product's claim that the reader can tell what the application
 * is doing by looking at it. That only holds if the states are actually
 * distinguishable and if the mapping does not drift while someone tunes an
 * animation, so the mapping is asserted here rather than reviewed by eye.
 */
describe("the Observer orb", () => {
  it("defines every state exactly once", () => {
    expect(new Set(ORB_STATES).size).toBe(ORB_STATES.length);
    for (const state of ORB_STATES) expect(orbProfile(state)).toBeDefined();
  });

  it("gives every state a distinct appearance", () => {
    // Two states that render identically are one state with two names, and the
    // reader learns nothing from the difference between them.
    const shapes = ORB_STATES.map((s) => {
      const p = orbProfile(s);
      return [p.aperture, p.halo, p.luminance, p.wave, p.spin, p.filaments].join("|");
    });
    expect(new Set(shapes).size).toBe(ORB_STATES.length);
  });

  it("gives every state a sentence a screen reader can use", () => {
    for (const state of ORB_STATES) {
      const { label } = orbProfile(state);
      expect(label.length).toBeGreaterThan(12);
      expect(label.endsWith(".")).toBe(true);
    }
  });

  it("says the microphone is on when it is listening", () => {
    // A listening state that does not announce the microphone is a privacy
    // problem, not a styling one.
    expect(orbProfile("listening").label).toMatch(/microphone/i);
  });

  it("turns inward while thinking and opens up on an insight", () => {
    expect(orbProfile("thinking").spin).toBeLessThan(0);
    expect(orbProfile("thinking").aperture).toBeLessThan(orbProfile("idle").aperture);
    expect(orbProfile("insight").aperture).toBeGreaterThan(orbProfile("idle").aperture);
    expect(orbProfile("insight").halo).toBeGreaterThan(orbProfile("idle").halo);
  });

  it("goes quiet rather than red when it cannot interpret", () => {
    const off = orbProfile("error");
    expect(off.saturation).toBeLessThan(0.5);
    expect(off.luminance).toBeLessThan(orbProfile("idle").luminance);
    expect(off.label).toMatch(/evidence is still available/i);
  });

  it("keeps idle quieter than anything asking to be noticed", () => {
    const idle = orbProfile("idle");
    for (const loud of ["attention", "insight", "listening", "speaking"] as const) {
      expect(orbProfile(loud).luminance).toBeGreaterThan(idle.luminance);
    }
  });

  describe("transitions", () => {
    it("moves partway at a partial step and lands exactly at a full one", () => {
      const from = orbProfile("idle");
      const to = orbProfile("insight");

      const half = blendProfiles(from, to, 0.5);
      expect(half.aperture).toBeGreaterThan(from.aperture);
      expect(half.aperture).toBeLessThan(to.aperture);

      const done = blendProfiles(from, to, 1);
      expect(done.aperture).toBeCloseTo(to.aperture, 6);
      expect(done.halo).toBeCloseTo(to.halo, 6);
    });

    it("adopts the destination's words immediately", () => {
      // The label describes what Observer is doing, and it is already doing the
      // new thing — a screen reader must not be told it is idle for the length
      // of a cross-fade.
      const blended = blendProfiles(orbProfile("idle"), orbProfile("thinking"), 0.01);
      expect(blended.label).toBe(orbProfile("thinking").label);
    });

    it("clamps a step outside 0–1 instead of overshooting", () => {
      const from = orbProfile("idle");
      const to = orbProfile("thinking");
      expect(blendProfiles(from, to, 4).aperture).toBeCloseTo(to.aperture, 6);
      expect(blendProfiles(from, to, -2).aperture).toBeCloseTo(from.aperture, 6);
    });

    it("survives a walk through every state without producing a bad value", () => {
      let current = orbProfile("idle");
      for (const state of [...ORB_STATES, ...ORB_STATES].reverse() as OrbState[]) {
        for (let step = 0; step < 6; step += 1) {
          current = blendProfiles(current, orbProfile(state), 0.3);
          expect(Number.isFinite(current.aperture)).toBe(true);
          expect(current.aperture).toBeGreaterThan(0);
          expect(current.halo).toBeGreaterThan(0);
          expect(current.saturation).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe("colour", () => {
    it("stays inside one hue family", () => {
      // Blue through cyan, never a rainbow: blue is the dominant channel at
      // every point of the range.
      for (let w = 0; w <= 1.001; w += 0.05) {
        const { r, g, b } = orbColour(w, 1);
        expect(b).toBeGreaterThanOrEqual(g);
        expect(g).toBeGreaterThanOrEqual(r);
      }
    });

    it("desaturates towards grey, not towards black", () => {
      const grey = orbColour(0.5, 0);
      expect(grey.r).toBe(grey.g);
      expect(grey.g).toBe(grey.b);
      expect(grey.r).toBeGreaterThan(40);
    });

    it("clamps warmth outside the range", () => {
      expect(orbColour(-5, 1)).toEqual(orbColour(0, 1));
      expect(orbColour(9, 1)).toEqual(orbColour(1, 1));
    });
  });
});
