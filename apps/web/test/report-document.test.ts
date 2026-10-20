import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Language, OverviewQuery, Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { agentAnswer } from "@/components/agents/answer";
import { cssString } from "@/components/report/ReportDocument";
import { AGENT_REPORT_WORDS, REPORT_WORDS } from "@/components/report/words";

/**
 * THE PRINTED REPORT IS A DOCUMENT, AND ITS COVER IS THE READ MODEL'S (ADR-0049).
 *
 * The owner exported Zsófia Bárány's summary from Shark Residence and found
 * fourteen pages of one column, no cover, and an explanatory paragraph after
 * every section. The page is rendered here as the server renders it — the
 * real page component, the synthetic repository behind it, one viewer — and
 * the document's parts are measured in the markup:
 *
 *   - the cover states the verdict and the headline figures exactly as the
 *     read model wrote them: the page passes them through and computes none;
 *   - every printed section is numbered, in the manifest's order, and the
 *     contents repeat the numbers; a section the reader left out keeps its
 *     place in the contents, unnumbered;
 *   - the notes that followed a section stand in "How to read this report",
 *     under that section's number, and nowhere in the body but a table's own
 *     caption, which stays the table's accessible name;
 *   - the running footer's words are the report's language, safely quoted.
 */

const state = vi.hoisted(() => ({ viewer: null as unknown }));

vi.mock("../src/lib/session", () => ({
  requireViewer: async () => state.viewer,
}));

vi.mock("../src/lib/repository", async () => {
  const synthetic = await import("@observer/synthetic");
  return { repository: new synthetic.SyntheticObserverRepository() };
});

const { default: ReportPage } =
  await import("../src/app/(app)/[tenantSlug]/[projectSlug]/report/page");

const repo = new SyntheticObserverRepository();
const viewer = VIEWERS.managerShark as Viewer;
const SHARK = { tenantSlug: "shark", projectSlug: "shark-residence" } as const;
const ZSOFIA = "agt_sharkzsofia01";
const query = (language: Language): OverviewQuery => ({
  viewer,
  ...SHARK,
  period: "year_to_date",
  language,
});

/** The page's scope components are async server components; the renderer here is not. */
async function settle(node: unknown): Promise<ReactElement> {
  const element = node as { type?: unknown; props?: unknown };
  if (typeof element.type === "function" && element.type.constructor.name === "AsyncFunction") {
    return settle(await (element.type as (props: unknown) => Promise<unknown>)(element.props));
  }
  return node as ReactElement;
}

async function render(search: Record<string, string>): Promise<string> {
  state.viewer = viewer;
  const page = await ReportPage({
    params: Promise.resolve({ ...SHARK }),
    searchParams: Promise.resolve({ period: "year_to_date", ...search }),
  });
  return renderToStaticMarkup(await settle(page));
}

/** Text as React writes it into markup. */
const esc = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

function coverOf(html: string): string {
  const at = html.indexOf('<section class="ox-cover');
  expect(at, "the page has no cover").toBeGreaterThan(-1);
  return html.slice(at, html.indexOf("</section>", at));
}

/** The body before the notes appendix, and the appendix. */
function split(html: string): { readonly body: string; readonly notes: string } {
  const at = html.indexOf('<section class="ox-plane ox-report-notes"');
  expect(at, "the page has no notes appendix").toBeGreaterThan(-1);
  return { body: html.slice(0, at), notes: html.slice(at) };
}

const numbered = (html: string) =>
  [
    ...html.matchAll(
      /<h2 class="ox-section-title" id="([^"]+)-heading"><span class="ox-report-num">(\d+)<\/span>/g,
    ),
  ].map((m) => [m[1], m[2]]);

describe("the agent summary, as printed", async () => {
  const html = await render({ agent: ZSOFIA, lang: "hu" });
  const view = await repo.getAgentDetail(query("hu"), ZSOFIA);
  const report = await repo.getReportScope(query("hu"), { agentId: ZSOFIA });
  const words = AGENT_REPORT_WORDS.hu;

  it("carries the read model's verdict and figures on its cover, as written", () => {
    const cover = coverOf(html);
    const verdict = agentAnswer(view, "hu");
    expect(verdict, "the fixture states a verdict").not.toBeNull();
    expect(cover).toContain(`<p class="ox-cover-verdict">${esc(verdict ?? "")}</p>`);
    expect(cover).toContain(
      `<h1 class="ox-cover-title" id="report-cover-title">${esc(view.name)}</h1>`,
    );

    const figures = view.activity.slice(0, 4);
    expect(figures.length, "the summary opens with its activity").toBeGreaterThanOrEqual(3);
    expect(cover.split('<div class="ox-cover-figure"').length - 1).toBe(figures.length);
    for (const metric of figures) {
      expect(cover).toContain(`<dt>${esc(metric.label)}</dt>`);
      expect(metric.display, metric.metricId).not.toBeNull();
      expect(cover).toContain(`<span class="ox-figure">${esc(metric.display ?? "")}</span>`);
      if (metric.qualifier !== null) {
        expect(cover, `${metric.metricId} without its base`).toContain(
          `<span class="ox-of">${esc(metric.qualifier)}</span>`,
        );
      }
    }
    expect(cover).toContain(esc(report.periodLabel));
    expect(cover).toContain("Belső használatra — vevőknek nem");
  });

  it("numbers every section, in the manifest's order, in the headings and the contents", () => {
    const expected = report.sections.map((s, i) => [s.id, String(i + 1).padStart(2, "0")]);
    expect(numbered(html)).toEqual(expected);
    for (const [id, n] of expected) {
      expect(html).toContain(
        `<span class="ox-report-num">${n ?? ""}</span><a class="ox-toc-label" href="#${id ?? ""}">`,
      );
    }
  });

  it("moves every note a section printed beneath it into the appendix, under its number", () => {
    const { body, notes } = split(html);
    const moved = [
      view.followUp.note,
      words.recordedNote(view.name),
      words.presentationCaption(
        view.name,
        view.belowMinimum,
        view.sampleSize,
        view.minimumSampleSize,
      ),
      words.buyersCaption(view.name, view.belowMinimum, view.sampleSize, view.minimumSampleSize),
      words.outcomeCaption(view.name, view.belowMinimum, view.sampleSize, view.minimumSampleSize),
      words.unitsCaption(view.name, view.context.period.label),
      words.projectsNote,
      words.appendixCaption,
    ];
    for (const note of moved) {
      expect(notes, note.slice(0, 60)).toContain(`<p class="ox-notes-text">${esc(note)}</p>`);
      /* A table keeps the sentence as its caption, its accessible name; nothing else does. */
      expect(
        body.replaceAll(`<caption>${esc(note)}</caption>`, ""),
        note.slice(0, 60),
      ).not.toContain(esc(note));
    }
  });

  it("states a partial section's gap in its appendix entry, not beneath its heading", () => {
    const partial = report.sections.filter((s) => s.availability === "partial");
    expect(partial.length, "the fixture has a partial section").toBeGreaterThan(0);
    const { body, notes } = split(html);
    for (const section of partial) {
      const n = String(report.sections.indexOf(section) + 1).padStart(2, "0");
      expect(notes).toContain(
        `<h3 class="ox-notes-head"><span class="ox-report-num">${n}</span> ${esc(section.label)}</h3><p class="ox-notes-text">${esc(section.reason ?? "")}</p>`,
      );
      expect(body).not.toContain(esc(section.reason ?? ""));
    }
  });

  it("writes the running footer in the report's language", () => {
    const text = [
      "IRIS Observer",
      "Shark Residence",
      words.kicker,
      view.name,
      view.context.period.label,
    ].join(" · ");
    expect(html).toContain(`@page report { @bottom-left { content: ${cssString(text)}; } }`);
  });
});

describe("a section the reader left out", async () => {
  const html = await render({ agent: ZSOFIA, lang: "hu", omit: "agent-projects" });
  const report = await repo.getReportScope(query("hu"), { agentId: ZSOFIA });

  it("keeps its place in the contents, unnumbered, and the rest are numbered without it", () => {
    const left = report.sections.find((s) => s.id === "agent-projects");
    expect(left?.availability).not.toBe("unavailable");
    expect(html).toContain(
      `<li data-left-out="true"><span class="ox-report-num" aria-hidden="true">—</span><span class="ox-toc-label">${esc(left?.label ?? "")}</span><span class="ox-toc-state">${esc(REPORT_WORDS.hu.leftOut)}</span></li>`,
    );
    const printed = report.sections.filter((s) => s.id !== "agent-projects");
    expect(numbered(html)).toEqual(printed.map((s, i) => [s.id, String(i + 1).padStart(2, "0")]));
    expect(split(html).notes).not.toContain(esc(AGENT_REPORT_WORDS.hu.projectsNote));
  });
});

describe("the project report, as printed", async () => {
  const html = await render({ lang: "en" });
  const flow = await repo.getSalesFlow(query("en"));
  const agents = await repo.getAgentsView(query("en"));

  it("carries Sales Flow's verdict and the figures the page reads, each with its base", () => {
    const cover = coverOf(html);
    expect(cover).toContain(`<p class="ox-cover-verdict">${esc(flow.verdict)}</p>`);
    expect(cover).toContain(
      `<span class="ox-figure">${String(flow.meetingCount)}</span><span class="ox-of">`,
    );
    expect(cover).toContain(
      `<span class="ox-figure">${String(agents.timedMeetingCount)}</span><span class="ox-of">of ${String(agents.meetingCount)} meetings</span>`,
    );
    expect(cover).toContain(esc(flow.team.display));
    const unrecorded = flow.outcomes.find((slice) => slice.outcome === "skipped");
    expect(unrecorded, "the fixture has meetings with no outcome").toBeDefined();
    expect(cover).toContain(
      `<span class="ox-figure">${String(unrecorded?.count)}</span><span class="ox-of">of ${String(flow.meetingCount)} meetings</span>`,
    );
  });

  it("moves the outcome caption and the ladder's note to the appendix", () => {
    const { body, notes } = split(html);
    for (const note of [
      REPORT_WORDS.en.outcomesCaption,
      flow.ladder.note,
      REPORT_WORDS.en.agentsCaption,
    ]) {
      expect(notes).toContain(`<p class="ox-notes-text">${esc(note)}</p>`);
      expect(body.replaceAll(`<caption>${esc(note)}</caption>`, "")).not.toContain(esc(note));
    }
  });

  it("draws the outcome mix from the read model's slices, a part for each one with meetings", () => {
    const parts = [...html.matchAll(/<rect class="ox-mix-part" data-outcome="([a-z_]+)" x=/g)].map(
      (m) => m[1],
    );
    expect(parts).toEqual(flow.outcomes.filter((s) => s.count > 0).map((s) => s.outcome));
  });
});

describe("the meeting summary, as printed", async () => {
  const meetings = await repo.getMeetings(query("en"), {
    agentId: null,
    channel: null,
    outcome: null,
  });
  const meetingId = meetings.rows[0]?.meetingId ?? "";
  const html = await render({ meeting: meetingId, lang: "en" });
  const replay = await repo.getMeetingReplay({ ...query("en"), meetingId: meetingId as never });

  it("carries the replay's headline and its four facts on the cover", () => {
    const cover = coverOf(html);
    expect(cover).toContain(`<p class="ox-cover-verdict">${esc(replay.headline)}</p>`);
    for (const fact of [
      replay.startedDisplay,
      replay.durationDisplay,
      replay.agentName,
      replay.outcomeLabel,
    ]) {
      expect(cover).toContain(`<span class="ox-cover-statement">${esc(fact)}</span>`);
    }
  });
});

describe("the footer's words in a stylesheet", () => {
  it("are one CSS string that no name can close or break", () => {
    const quoted = cssString('Kovács "K" \\ </style><script>\nx');
    expect(quoted).toBe('"Kovács \\"K\\" \\\\ \\3c /style>\\3c script>\\a x"');
    expect(quoted).not.toContain("<");
    expect(quoted).not.toContain("\n");
  });
});
