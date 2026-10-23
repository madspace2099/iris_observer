import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, type MeetingFilterOptions } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { meetingFilterFields } from "@/components/meetings/filters";
import { DemandAttention } from "@/components/units/DemandAttention";
import { UnitFunnel } from "@/components/units/UnitFunnel";

/**
 * THE STOCK PAGES BEFORE THE VIDEO (Máté's review, 2026-10-23).
 *
 * The figures that disagreed on camera, and the text that moved behind an `i`
 * without taking a figure with it.
 */

const query = {
  viewer: VIEWERS.developerShark,
  tenantSlug: "shark",
  projectSlug: "shark-residence",
  period: "quarter_to_date",
  language: DEFAULT_LANGUAGE,
} as const;

const OPTIONS: MeetingFilterOptions = {
  agents: [
    { id: "lena", label: "Lena Fischer", count: 40 },
    { id: "oliver", label: "Oliver Grant", count: 30 },
  ],
  channels: [{ id: "showroom", label: "IRIS Showroom", count: 120 }],
  outcomes: [{ id: "purchase", label: "Purchase", count: 11 }],
  features: [],
} as never;

const labels = (fields: ReturnType<typeof meetingFilterFields>, name: string): string[] =>
  (
    fields.find((field) => field.name === name) as unknown as { options: { label: string }[] }
  ).options.map((option) => option.label);

describe("the meeting register's options", () => {
  it("count what an option would keep only while no other filter narrows", () => {
    const none = { agentId: null, channel: null, outcome: null, features: null };
    expect(labels(meetingFilterFields(OPTIONS, none), "outcome")).toContain("Purchase (11)");

    /* Lena chosen: her own axis still counts (each agent alone), the others do not. */
    const lena = meetingFilterFields(OPTIONS, { ...none, agentId: "lena" });
    expect(labels(lena, "agent")).toContain("Oliver Grant (30)");
    expect(labels(lena, "outcome")).toContain("Purchase");
    expect(labels(lena, "outcome").join()).not.toMatch(/\(\d+\)/);

    /* Lena and Purchase: "Purchase (11)" beside "7 of 150" is gone from both. */
    const both = meetingFilterFields(OPTIONS, { ...none, agentId: "lena", outcome: "purchase" });
    for (const name of ["agent", "channel", "outcome"])
      expect(labels(both, name).join(), name).not.toMatch(/\(\d+\)/);
  });
});

describe("a unit's funnel", () => {
  it("draws no bar for the catalogue's yes or no, says its source once, and claims no tier where nothing answers", async () => {
    const detail = await new SyntheticObserverRepository().getUnitDetail(query as never, "S-503");
    const html = renderToStaticMarkup(
      createElement(UnitFunnel, { stages: detail.funnel, language: DEFAULT_LANGUAGE }),
    );
    const stages = html.split('class="ox-stage"').slice(1);
    expect(stages).toHaveLength(detail.funnel.length);
    detail.funnel.forEach((stage, i) => {
      const drawn = (stages[i] ?? "").includes("ox-stage-fill");
      expect(drawn, stage.id).toBe(
        stage.verification !== "verified" && stage.step.toCount !== null,
      );
    });
    expect(html).not.toContain("stated by the catalogue");
    expect(html.match(/Source/g)?.length ?? 0).toBeLessThanOrEqual(1);
    const offer = stages[detail.funnel.findIndex((stage) => stage.verification === "unavailable")];
    expect(offer).not.toContain("ox-tier");
    /* Round 9: a stage the catalogue states is not "Observed". */
    detail.funnel.forEach((stage, i) => {
      if (stage.verification === "verified") expect(stages[i], stage.id).not.toContain("ox-tier");
    });
  });
});

describe("high interest, never shortlisted", () => {
  it("is one line when the question came back clear, and keeps its denominator", async () => {
    const attention = await new SyntheticObserverRepository().getAttention(query as never);
    const html = renderToStaticMarkup(
      createElement(DemandAttention, {
        states: [],
        checks: attention.checks.map((check) =>
          check.kind === "viewed_never_shortlisted" ? { ...check, state: "clear" as const } : check,
        ),
        period: "quarter_to_date",
        meetingCount: 150,
        periodLabel: "Quarter to date",
        language: DEFAULT_LANGUAGE,
      }),
    );
    expect(html).toContain("Clear");
    expect(html).toContain("Asked of 150 meetings in Quarter to date.");
    expect(html).not.toContain("ox-scope");
    expect(html).not.toContain("What it asked, and what it found, is below");
  });
});

describe("the units page's building note", () => {
  it("states the catalogue now, and no unobserved period beside the CRM's dated sales", () => {
    const page = readFileSync(
      resolve(import.meta.dirname, "../src/app/(app)/[tenantSlug]/[projectSlug]/units/page.tsx"),
      "utf8",
    );
    expect(page).toContain("flats now:");
    expect(page).not.toContain("is not observed yet");
  });
});
