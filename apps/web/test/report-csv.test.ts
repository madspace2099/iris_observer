import { describe, expect, it } from "vitest";

import { DATA_SOURCE_MARKER_WORDS, type OverviewQuery, type Viewer } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

import { CSV_WORDS, csvCell, csvFilename, toCsv } from "@/components/report/csv";
import { reportFigures } from "@/components/report/figures";

/**
 * THE REPORT'S FIGURES AS CSV (ADR-0045).
 *
 * The owner, 2026-10-20: "the Generate document button is locked". The CSV is
 * the report page flattened — so its writer is checked for what a spreadsheet
 * does with a careless file (encoding, quoting, formulas), and its rows for
 * following the reader's composition (sections taken out, language chosen)
 * and for keeping every figure's denominator and every absence's word.
 */

const repo = new SyntheticObserverRepository();
const petra = VIEWERS.developer as Viewer;
const query = (language: OverviewQuery["language"]): OverviewQuery => ({
  viewer: petra,
  tenantSlug: "alpha",
  projectSlug: "northgate",
  period: "quarter_to_date",
  language,
});

describe("the CSV writer", () => {
  it("quotes what RFC 4180 says to quote, and doubles the quotes inside", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('the "two-room" finding')).toBe('"the ""two-room"" finding"');
    expect(csvCell("one\nline")).toBe('"one\nline"');
    /* Either separator is quoted, so the file reads alike whichever one it is split on. */
    expect(csvCell("a; b")).toBe('"a; b"');
  });

  it("refuses to hand a spreadsheet a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+18% against last quarter")).toBe("'+18% against last quarter");
    expect(csvCell("-4 days")).toBe("'-4 days");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tpadded")).toBe("'\tpadded");
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
    /* Straight after a separator too: an Excel splitting on the other one starts a cell there. */
    expect(csvCell("Lena;=HYPERLINK(1)")).toBe('"Lena;\'=HYPERLINK(1)"');
    expect(csvCell("a,-b")).toBe('"a,\'-b"');
    expect(csvCell("Lena; -4 days")).toBe('"Lena; -4 days"');
    /* A typographic minus is a character, not a formula. */
    expect(csvCell("−4 days")).toBe("−4 days");
  });

  it("opens with a byte-order mark, heads in the report's language, and CRLF lines", () => {
    const row = {
      section: "Szakasz A",
      figure: "Adat",
      value: "1,9×",
      denominator: "n = 4",
      sources: "IRIS",
    };
    const file = toCsv("hu", "Negyedév eddig", "Northgate", [row]);
    expect(file.startsWith("\uFEFF")).toBe(true);
    const lines = file.slice(1).split("\r\n");
    /* Semicolons in Hungarian and Slovak, where the comma is the decimal mark. */
    expect(lines[0]).toBe(CSV_WORDS.hu.columns.join(";"));
    expect(lines[1]).toBe('Szakasz A;Adat;"1,9×";n = 4;Negyedév eddig;Northgate;IRIS');
    expect(lines[2]).toBe("");
    expect(toCsv("sk", "p", "s", [row]).slice(1).split("\r\n")[0]).toBe(
      CSV_WORDS.sk.columns.join(";"),
    );
    /* Commas in English. */
    expect(toCsv("en", "Quarter to date", "Northgate", [row]).split("\r\n")[1]).toBe(
      'Szakasz A,Adat,"1,9×",n = 4,Quarter to date,Northgate,IRIS',
    );
  });

  it("names the file in ASCII, accents folded", () => {
    expect(csvFilename(["shark-residence", "Zsófia Barány", "year_to_date", "hu"])).toBe(
      "shark-residence_zsofia-barany_year-to-date_hu.csv",
    );
    expect(csvFilename(["northgate", "Ľubomír Őrsi", "last_28_days", "sk"])).toBe(
      "northgate_lubomir-orsi_last-28-days_sk.csv",
    );
  });
});

describe("the CSV's rows are the report page's", () => {
  it("opens with the cover, then frames every printed section with its state and sample", async () => {
    const { report, rows } = await reportFigures(repo, query("en"), null, new Set());
    const sections = [...new Set(rows.map((row) => row.section))];
    expect(sections).toEqual([
      report.scope.label,
      ...report.sections.map((section) => section.label),
    ]);
    for (const section of report.sections) {
      const state = rows.find((row) => row.section === section.label && row.figure === "State");
      expect(state?.value, section.id).toBe(
        { ready: "Ready", partial: "Partial", unavailable: "Blank" }[section.availability],
      );
      expect(state?.denominator, section.id).toBe(
        section.sampleSize === null ? "" : `n = ${section.sampleSize} ${section.sampleNoun}`,
      );
    }
  });

  it("says on its cover whose data it is and who it is for, as the page does", async () => {
    const { rows } = await reportFigures(repo, query("en"), null, new Set());
    /* Northgate's meetings are the synthetic world's: the page wears "Demo data". */
    expect(rows[0]?.value).toBe(DATA_SOURCE_MARKER_WORDS.en.synthetic.full);
    expect(rows[1]?.value).toBe("Audience: internal.");
  });

  it("leaves out a section the reader took out, and says on the cover that it did", async () => {
    const all = await reportFigures(repo, query("en"), null, new Set());
    const writable = all.report.sections.find(
      (section) => section.availability !== "unavailable" && section.id !== "evidence-appendix",
    );
    expect(writable).toBeDefined();
    const { report, rows } = await reportFigures(
      repo,
      query("en"),
      null,
      new Set([writable?.id ?? ""]),
    );
    expect(rows.some((row) => row.section === writable?.label)).toBe(false);
    /* The one row that names it is the cover's, as the page's contents list names it. */
    expect(rows.filter((row) => row.figure === writable?.label)).toEqual([
      {
        section: report.scope.label,
        figure: writable?.label,
        value: "Left out at the reader’s request",
        denominator: "",
        sources: "",
      },
    ]);
    expect(rows.map((row) => row.value)).toContain(
      `1 of ${report.sections.length} left out at the reader's request.`,
    );
    expect(rows.length).toBeLessThan(all.rows.length);
  });

  it("gives a figure its own base, never the section's sample", async () => {
    const { rows } = await reportFigures(repo, query("en"), null, new Set());
    const agents = await repo.getAgentsView(query("en"));
    const rated = agents.agents.filter((a) => !a.belowMinimum && a.ring.decidedMeetings > 0);
    expect(rated.length).toBeGreaterThan(0);
    for (const agent of rated) {
      const rate = rows.find((row) => row.figure.startsWith(`${agent.name} · Progressed`));
      expect(rate?.denominator, agent.name).toBe(`of ${agent.ring.decidedMeetings} meetings`);
      const median = rows.find((row) => row.figure === `${agent.name} · Median duration`);
      expect(median?.denominator, agent.name).toBe(`n = ${agent.meetings} meetings`);
    }
    /* A share of stock is of units, and the read model states no count of them. */
    const stock = rows.filter((row) => row.figure.endsWith(" · Share of stock"));
    expect(stock.length).toBeGreaterThan(0);
    expect(stock.every((row) => row.denominator === "")).toBe(true);
    const coverage = rows.filter((row) => row.figure.endsWith(" · Share of time"));
    expect(coverage.length).toBeGreaterThan(0);
    expect(
      coverage.every((row) => row.denominator === `of ${agents.timedMeetingCount} timed meetings`),
    ).toBe(true);
  });

  it("writes a finding with the so-what and the caveat the page prints under it", async () => {
    const roster = await repo.getAgentsView(query("en"));
    let caveats = 0;
    for (const agent of roster.agents) {
      const view = await repo.getAgentDetail(query("en"), agent.agentId);
      const { rows } = await reportFigures(
        repo,
        query("en"),
        { agentId: agent.agentId },
        new Set(),
      );
      const written = rows.filter((row) => row.figure === "Finding").map((row) => row.value);
      for (const finding of view.findings) {
        const row = written.find((value) => value.startsWith(finding.statement));
        expect(row, finding.id).toContain(finding.soWhat);
        if (finding.caveat === null) continue;
        expect(row, finding.id).toContain(finding.caveat);
        caveats += 1;
      }
    }
    /* At least one caveat was there to lose, so the test is not passing on none. */
    expect(caveats).toBeGreaterThan(0);
  });

  it("states the period's bounds beside its name", async () => {
    const { report, period } = await reportFigures(repo, query("en"), null, new Set());
    expect(period.startsWith(`${report.periodLabel} (`)).toBe(true);
    expect(period).toMatch(/\d{4}/);
  });

  it("is written in the language asked for, the read model's words and its own", async () => {
    const en = await reportFigures(repo, query("en"), null, new Set());
    const hu = await reportFigures(repo, query("hu"), null, new Set());
    expect(hu.rows.map((row) => row.section)).not.toEqual(en.rows.map((row) => row.section));
    expect(hu.rows.some((row) => row.figure === "State")).toBe(false);
    expect(hu.rows.filter((row) => ["Kész", "Részleges", "Üres"].includes(row.value)).length).toBe(
      hu.report.sections.length,
    );
  });

  it("writes an agent's summary with every share's denominator, and no buyer's name", async () => {
    const agents = await repo.getAgentsView(query("en"));
    const agent = agents.agents[0];
    expect(agent).toBeDefined();
    const { rows, subject } = await reportFigures(
      repo,
      query("en"),
      { agentId: agent?.agentId ?? "" },
      new Set(),
    );
    expect(subject).toBe(agent?.name);
    const shares = rows.filter((row) => /^\d+\s?%$/.test(row.value.replace(/\u00a0/g, " ")));
    expect(shares.length).toBeGreaterThan(0);
    expect(shares.filter((row) => row.denominator.length === 0)).toEqual([]);
  });

  it("never writes a buyer's name, even for a viewer the register names buyers to", async () => {
    /* The agency manager is in `AGENT_REGISTER_ROLES`: the register is written, names and all on the page. */
    const asTomas = { ...query("en"), viewer: VIEWERS.agencyManager as Viewer };
    const roster = await repo.getAgentsView(asTomas);
    let checked = 0;
    for (const agent of roster.agents) {
      const view = await repo.getAgentDetail(asTomas, agent.agentId);
      const names = view.recentMeetings
        .map((row) => row.visitorName)
        .filter((name): name is string => name !== null);
      if (names.length === 0) continue;
      const figures = await reportFigures(repo, asTomas, { agentId: agent.agentId }, new Set());
      const file = toCsv("en", figures.period, figures.report.scope.label, figures.rows);
      /* The register is there, so the test is not passing on an empty section. */
      const first = view.recentMeetings[0]?.label ?? "";
      expect(figures.rows.some((row) => row.figure.startsWith(`${first} · `))).toBe(true);
      for (const name of names) expect(file, agent.agentId).not.toContain(name);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("never writes an absent figure as zero", async () => {
    const { rows } = await reportFigures(repo, query("en"), null, new Set());
    const blank = rows.filter((row) => row.figure === "State" && row.value === "Blank");
    expect(blank.length).toBeGreaterThan(0);
    for (const state of blank) {
      const inside = rows.filter((row) => row.section === state.section);
      expect(inside.map((row) => row.value)).not.toContain("0");
    }

    /* A figure no source records is its word, with no denominator to stand beside it. */
    const ister = { ...query("en"), projectSlug: "ister-tower" };
    const view = await repo.getAgentDetail(ister, "agt_martinkovac");
    const agent = await reportFigures(repo, ister, { agentId: "agt_martinkovac" }, new Set());
    const absent = [...view.activity, view.followUp.recorded, view.followUp.completed].filter(
      (value) => value.state === "unavailable",
    );
    expect(absent.length).toBeGreaterThan(0);
    for (const value of absent) {
      const row = agent.rows.find((each) => each.figure === value.label);
      expect(row?.value.startsWith("Unavailable"), value.label).toBe(true);
      expect(row?.denominator).toBe("");
    }
  });
});
