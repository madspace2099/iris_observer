import { describe, expect, it } from "vitest";
import type { MeetingId } from "@observer/contracts";
import { LANGUAGES, sentence, slovakZForm, type Language } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "../src/index";
import { FLOW_UNRECORDED_SENTENCE } from "../src/showroom/views3";

/**
 * A REPORT IN ANOTHER LANGUAGE IS THE SAME REPORT (P2-17).
 *
 * The export dialog prints a project report and a meeting summary in Slovak
 * and Hungarian as well as English. Between them only words may change: every
 * section and its state, every sample, and every step, code, clock and
 * evidence reference of a replay is the same whatever the language, because
 * the same input has to give the same figures.
 */
const repo = new SyntheticObserverRepository();
const where = (language: Language) =>
  ({
    viewer: VIEWERS.agencyManager,
    tenantSlug: "alpha",
    projectSlug: "northgate",
    period: "quarter_to_date",
    language,
  }) as const;

/* The digits a text carries, in order: what a translation must never change. */
const figures = (text: string) => text.match(/\d+/g) ?? [];

describe("a project report in each language", () => {
  it("has the same sections, states and samples as the English one", async () => {
    const shape = async (language: Language) =>
      (await repo.getReportScope(where(language))).sections.map((s) => [
        s.id,
        s.availability,
        s.sampleSize,
      ]);
    const english = await shape("en");
    for (const language of LANGUAGES) expect(await shape(language), language).toEqual(english);
  });

  it("names its period and its outcomes in that language, with the same counts", async () => {
    const english = await repo.getSalesFlow(where("en"));
    for (const language of LANGUAGES) {
      const flow = await repo.getSalesFlow(where(language));
      expect(
        flow.outcomes.map((o) => [o.outcome, o.count]),
        language,
      ).toEqual(english.outcomes.map((o) => [o.outcome, o.count]));
      if (language === "en") continue;
      expect(
        flow.outcomes.map((o) => o.label),
        language,
      ).not.toEqual(english.outcomes.map((o) => o.label));
      expect(flow.context.period.label, language).not.toBe(english.context.period.label);
    }
  });
});

describe("a meeting summary in each language", () => {
  /* A meeting with every kind of step: sections, units, interactions, an environment change, an outcome. */
  const replay = (language: Language) =>
    repo.getMeetingReplay({ ...where(language), meetingId: "mtg_ng0132" as MeetingId });

  it("replays the same steps, codes, clocks and evidence", async () => {
    const shape = (r: Awaited<ReturnType<typeof replay>>) =>
      r.steps.map((s) => [
        s.ordinal,
        s.kind,
        s.sectionId,
        s.unitCode,
        s.atDisplay,
        s.evidence?.href,
      ]);
    const english = await replay("en");
    for (const language of LANGUAGES) {
      const translated = await replay(language);
      expect(shape(translated), language).toEqual(shape(english));
      expect(figures(translated.headline), language).toEqual(figures(english.headline));
      expect(translated.gaps.length, language).toBe(english.gaps.length);
    }
  });

  it("leaves no English step, outcome or gap standing in Slovak or Hungarian", async () => {
    const english = await replay("en");
    for (const language of ["sk", "hu"] as const) {
      const translated = await replay(language);
      translated.steps.forEach((step, i) => {
        /* A unit step is named by its code, which is the same in every language. */
        if (step.kind === "unit") return;
        expect(step.label, `${language} step ${String(i)}`).not.toBe(english.steps[i]?.label);
      });
      expect(translated.outcomeLabel, language).not.toBe(english.outcomeLabel);
      for (const gap of translated.gaps) expect(english.gaps, language).not.toContain(gap);
    }
    expect((await replay("sk")).headline).toMatch(/ (krok|kroky|krokov)\.$/);
    expect((await replay("hu")).headline).toMatch(/ lépés\.$/);
  });
});

describe("the Slovak 'z' or 'zo' before a count", () => {
  it("is read from the number it stands before, not written as 'z'", () => {
    const at = (total: number) =>
      sentence("sk", FLOW_UNRECORDED_SENTENCE, {
        count: "1",
        total: String(total),
        from: slovakZForm(total),
        n: 1,
      });
    expect(at(7)).toBe("1 zo 7 stretnutí sa skončilo bez zaznamenaného výsledku.");
    expect(at(8)).toBe("1 z 8 stretnutí sa skončilo bez zaznamenaného výsledku.");
    expect(at(40)).toBe("1 zo 40 stretnutí sa skončilo bez zaznamenaného výsledku.");
  });
});

describe("an agent summary in each language", () => {
  /* One agent above the floor and one below it, so both branches of every caption are read. */
  const AGENTS = ["agt_akhilesh", "agt_monika"] as const;
  const detail = (language: Language, agentId: string) =>
    repo.getAgentDetail(where(language), agentId);

  it("has the same figures, stages, rows and findings as the English one", async () => {
    const shape = (view: Awaited<ReturnType<typeof detail>>) => ({
      /* The raw figure, not its display: a duration is written in words, "18 minút" or "18 perc". */
      activity: view.activity.map((m) => [m.metricId, m.state, m.raw]),
      funnel: view.funnel.map((s) => [s.metric.metricId, s.fromCount, s.toCount]),
      outcomes: view.recordedOutcomes.map((o) => [o.outcome, o.metric.state, o.metric.raw]),
      buyers: view.buyerInterest.map((b) => [b.id, b.meetings, b.share, b.teamShare]),
      units: view.commonUnits.map((u) => [u.unitCode, u.meetings, u.favourites]),
      rows: view.recentMeetings.map((r) => [
        r.meetingId,
        r.followUp,
        r.visitor.kind,
        r.visitor.priorMeetings,
      ]),
      findings: view.findings.map((f) => [f.id, f.sampleSize]),
    });
    for (const agentId of AGENTS) {
      const english = shape(await detail("en", agentId));
      for (const language of LANGUAGES) {
        expect(shape(await detail(language, agentId)), `${agentId} ${language}`).toEqual(english);
      }
    }
  });

  it("leaves no English label, note, finding or row word standing in Slovak or Hungarian", async () => {
    const words = (view: Awaited<ReturnType<typeof detail>>) => [
      ...view.activity.flatMap((m) => [m.label, m.qualifier, m.message]),
      ...view.funnel.map((s) => s.label),
      view.followUp.recorded.label,
      view.followUp.completed.label,
      view.followUp.completed.message,
      view.followUp.note,
      ...view.recordedOutcomes.map((o) => o.label),
      ...view.buyerInterest.map((b) => b.label),
      ...view.findings.flatMap((f) => [f.statement, f.baseline, f.soWhat, f.caveat]),
      ...view.recentMeetings.flatMap((r) => [r.visitor.display, r.followUpLabel, r.outcomeLabel]),
    ];
    for (const agentId of AGENTS) {
      const english = new Set(words(await detail("en", agentId)).filter((w) => w !== null));
      for (const language of ["sk", "hu"] as const) {
        for (const word of words(await detail(language, agentId))) {
          if (word === null) continue;
          expect(english.has(word), `${agentId} ${language}: ${word}`).toBe(false);
        }
      }
    }
  });

  it("and its manifest has the same sections, states and samples", async () => {
    for (const agentId of AGENTS) {
      const shape = async (language: Language) =>
        (await repo.getReportScope(where(language), { agentId })).sections.map((s) => [
          s.id,
          s.availability,
          s.sampleSize,
        ]);
      const english = await shape("en");
      for (const language of LANGUAGES) {
        expect(await shape(language), `${agentId} ${language}`).toEqual(english);
      }
    }
  });
});

describe("a meeting summary's date is written as approved", () => {
  /*
   * ITEM 76 HU (DONTESEK1, Máté 2026-10-02).
   *
   * The approved Hungarian date is `aug. 24.`, lower case. The report's kicker
   * shows it in capitals through CSS alone; what the source writes, what is
   * copied and what is read aloud stays as approved.
   */
  it("keeps the Hungarian month abbreviation in lower case in the source", async () => {
    const scope = await repo.getReportScope(where("hu"), { meetingId: "mtg_ng0132" as MeetingId });
    expect(scope.scope.label).toContain("aug. 24.");
    expect(scope.scope.label).not.toContain("AUG.");
  });
});
