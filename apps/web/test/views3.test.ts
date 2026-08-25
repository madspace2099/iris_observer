import { describe, expect, it } from "vitest";
import { AMENITIES, PLACE_CATEGORIES, SURROUNDINGS } from "@observer/contracts";
import { VIEWERS, showroomSessions, syntheticRepository } from "@observer/synthetic";

/**
 * The three views, and the opening screen that leads to them.
 *
 * Review asked for a front door that answers in ten seconds and three separate
 * places to go. These guard the parts of that which would otherwise decay: the
 * opening screen staying small, the IRIS rating staying MADSPACE-only, and the
 * audience builder returning meetings rather than people.
 */
const QUERY = {
  viewer: VIEWERS.developer,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date" as const,
};

describe("the opening screen", () => {
  it("stays small enough to read in ten seconds", async () => {
    const home = await syntheticRepository.getHome(QUERY);
    // A verdict, a reason, three figures, three doors. Review rejected the
    // previous screen for carrying an analysis; this stops it coming back.
    expect(home.figures.length).toBeLessThanOrEqual(3);
    expect(home.doors.length).toBe(3);
    expect(home.verdict.length).toBeLessThan(90);
    expect(home.because.length).toBeLessThan(260);
  });

  it("carries a signal a reader can act on without reading a number", async () => {
    const home = await syntheticRepository.getHome(QUERY);
    expect(["good", "attention", "poor"]).toContain(home.signal);
  });

  it("gives every door something already computed to choose by", async () => {
    const home = await syntheticRepository.getHome(QUERY);
    for (const door of home.doors) {
      expect(door.headline.length, door.id).toBeGreaterThan(8);
      expect(door.question.endsWith("?"), door.id).toBe(true);
    }
  });

  it("does not report a week too small to read as a decline", async () => {
    const home = await syntheticRepository.getHome(QUERY);
    const weekly = home.figures.find((f) => f.id === "meetings");
    // One meeting against two is noise. The screen falls back to the month and
    // says so, rather than announcing a collapse.
    if (weekly?.label === "Meetings this month") {
      expect(home.because).toMatch(/too early to read/i);
    }
  });
});

describe("sales flow", () => {
  it("reports six named periods", async () => {
    const flow = await syntheticRepository.getSalesFlow(QUERY);
    expect(flow.periods.map((p) => p.id)).toEqual([
      "today",
      "yesterday",
      "this_week",
      "last_week",
      "this_month",
      "last_month",
    ]);
  });

  it("clips a part-week rather than comparing it with a whole one", async () => {
    const flow = await syntheticRepository.getSalesFlow(QUERY);
    expect(flow.periods.find((p) => p.id === "last_week")?.label).toMatch(/Last week/);
  });

  it("never reports a duration for a period with no meetings", async () => {
    const flow = await syntheticRepository.getSalesFlow(QUERY);
    for (const p of flow.periods) {
      if (p.meetings === 0) expect(p.medianDurationDisplay, p.id).toBe("—");
    }
  });

  it("gives each agent a ring whose shares sum to the whole", async () => {
    const flow = await syntheticRepository.getSalesFlow(QUERY);
    expect(flow.rings.length).toBeGreaterThan(1);
    for (const ring of flow.rings) {
      expect(
        ring.slices.reduce((a, s) => a + s.count, 0),
        ring.name,
      ).toBe(ring.meetings);
      expect(ring.slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5);
    }
  });

  it("raises a flag as a fact, never as a rank", async () => {
    const flow = await syntheticRepository.getSalesFlow(QUERY);
    for (const ring of flow.rings) {
      if (ring.flag === null) continue;
      expect(ring.flag.text).not.toMatch(/\b(worst|best|rank|ranked|bottom|last place)\b/i);
      expect(ring.flag.text).toMatch(/\d/);
    }
  });
});

describe("project", () => {
  it("answers what is interesting about a segment, not only whether it is", async () => {
    const view = await syntheticRepository.getProjectView(QUERY, "rooms-2");
    const segment = view.selectedSegment;
    expect(segment).not.toBeNull();
    // Five different acts, kept apart rather than averaged into "engagement".
    expect([...(segment?.examinedHow ?? [])].map((e) => e.id).sort()).toEqual([
      "balcony",
      "floor_cut",
      "plan",
      "screenshot",
      "shared",
    ]);
    expect(segment?.attendedTo.length).toBeGreaterThan(0);
  });

  it("uses the supplied place lists rather than invented ones", async () => {
    const view = await syntheticRepository.getProjectView(QUERY, null);
    const known = new Set([...SURROUNDINGS, ...AMENITIES].map((p) => p.name));
    expect(view.places.length).toBeGreaterThan(5);
    for (const place of view.places) expect(known.has(place.name), place.name).toBe(true);
  });

  it("marks neighbourhood places as needing an event the build does not emit", async () => {
    const view = await syntheticRepository.getProjectView(QUERY, null);
    expect(view.places.find((p) => p.section === "surroundings")?.availability).toBe(
      "requires_ue5_v2_event",
    );
    expect(view.places.find((p) => p.section === "amenities")?.availability).toBe(
      "legacy_available",
    );
  });

  it("marks stated demand as a measurement the build does not emit", async () => {
    const view = await syntheticRepository.getProjectView(QUERY, null);
    expect(view.demand.length).toBeGreaterThan(0);
    for (const d of view.demand) expect(d.availability).toBe("requires_ue5_v2_event");
  });
});

describe("sales agents", () => {
  it("shows the IRIS rating to MADSPACE and to nobody else", async () => {
    const asDeveloper = await syntheticRepository.getAgentsView(QUERY);
    expect(asDeveloper.showRatings).toBe(false);
    for (const a of asDeveloper.agents) expect(a.irisRating, a.name).toBeNull();

    const asMadspace = await syntheticRepository.getAgentsView({
      ...QUERY,
      viewer: VIEWERS.madspace,
    });
    expect(asMadspace.showRatings).toBe(true);
    expect(asMadspace.agents.some((a) => a.irisRating !== null)).toBe(true);
  });

  it("puts each agent's section time against the team's, not on its own", async () => {
    const view = await syntheticRepository.getAgentsView(QUERY);
    for (const agent of view.agents) {
      expect(agent.sections.length).toBeGreaterThan(0);
      for (const s of agent.sections) expect(s.teamShare).toBeGreaterThanOrEqual(0);
    }
  });

  it("counts repeat visits, because a third meeting is not a first", async () => {
    const view = await syntheticRepository.getAgentsView(QUERY);
    expect(view.repeats.length).toBeGreaterThan(1);
    expect(view.repeats.reduce((a, r) => a + r.meetings, 0)).toBe(view.meetingCount);
  });
});

describe("the audience builder", () => {
  const FAMILY = {
    rooms: 2,
    favouritedOnly: true,
    placeCategory: "family" as const,
    minimumPlaceSeconds: 25,
  };

  it("returns meetings, never a list of people", async () => {
    const view = await syntheticRepository.getAudience(QUERY, FAMILY);
    expect(view.total).toBeGreaterThan(0);
    for (const m of view.matches) {
      expect(m.href).toMatch(/\/meetings\//);
      // No email and no phone number reaches this surface.
      expect(m.because).not.toMatch(/@|\+\d{6,}/);
    }
  });

  it("says what a behaviour is and is not", async () => {
    /*
     * The wording may change; the guarantee may not.
     *
     * Product-boundary explanations were stripped from the interface, and this
     * caveat was caught in the sweep. It is not that kind of copy: inferring a
     * household from where somebody's attention went is the inference this
     * product must visibly refuse, so it is asserted on meaning rather than on
     * a phrase.
     */
    const view = await syntheticRepository.getAudience(QUERY, FAMILY);
    const caveats = view.caveats.join(" ");
    expect(caveats).toMatch(/never inferred|does not infer|not a fact about anyone's household/i);
    expect(caveats).toMatch(/meetings, not people/i);
  });

  it("narrows as the criteria tighten", async () => {
    const wide = await syntheticRepository.getAudience(QUERY, {
      rooms: null,
      favouritedOnly: false,
      placeCategory: null,
      minimumPlaceSeconds: 0,
    });
    const narrow = await syntheticRepository.getAudience(QUERY, {
      ...FAMILY,
      minimumPlaceSeconds: 40,
    });
    expect(narrow.total).toBeLessThan(wide.total);
  });

  it("offers every category the place lists actually use", () => {
    for (const c of new Set([...SURROUNDINGS, ...AMENITIES].map((p) => p.category))) {
      expect(PLACE_CATEGORIES).toContain(c);
    }
  });
});

describe("the enriched dataset", () => {
  it("records what buyers lingered on, and marks what the build cannot record", () => {
    expect(showroomSessions().filter((s) => s.places.length > 0).length).toBeGreaterThan(50);
    const poi = showroomSessions()
      .flatMap((s) => s.places)
      .find((p) => p.section === "surroundings");
    expect(poi?.availability).toBe("requires_ue5_v2_event");
  });

  it("lets agents skip the IRIS rating rather than defaulting it", () => {
    expect(showroomSessions().filter((s) => s.irisRating === null).length).toBeGreaterThan(0);
    for (const s of showroomSessions()) {
      if (s.irisRating === null) continue;
      expect(s.irisRating).toBeGreaterThanOrEqual(1);
      expect(s.irisRating).toBeLessThanOrEqual(5);
    }
  });
});
