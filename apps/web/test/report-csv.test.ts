import { describe, expect, it } from "vitest";

import type { OverviewQuery, Viewer } from "@observer/readmodels";
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
  });

  it("refuses to hand a spreadsheet a formula", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+18% against last quarter")).toBe("'+18% against last quarter");
    expect(csvCell("-4 days")).toBe("'-4 days");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tpadded")).toBe("'\tpadded");
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
    /* A typographic minus is a character, not a formula. */
    expect(csvCell("−4 days")).toBe("−4 days");
  });

  it("opens with a byte-order mark, heads in the report's language, and CRLF lines", () => {
    const file = toCsv("hu", "Negyedév eddig", "Northgate", [
      { section: "Szakasz A", figure: "Adat", value: "12", denominator: "n = 4", sources: "IRIS" },
    ]);
    expect(file.startsWith("\uFEFF")).toBe(true);
    const lines = file.slice(1).split("\r\n");
    expect(lines[0]).toBe(CSV_WORDS.hu.columns.join(","));
    expect(lines[1]).toBe("Szakasz A,Adat,12,n = 4,Negyedév eddig,Northgate,IRIS");
    expect(lines[2]).toBe("");
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
  it("frames every printed section with its state, in the read model's order", async () => {
    const { report, rows } = await reportFigures(repo, query("en"), null, new Set());
    const sections = [...new Set(rows.map((row) => row.section))];
    expect(sections).toEqual(report.sections.map((section) => section.label));
    for (const section of report.sections) {
      const state = rows.find((row) => row.section === section.label && row.figure === "State");
      expect(state?.value, section.id).toBe(
        { ready: "Ready", partial: "Partial", unavailable: "Blank" }[section.availability],
      );
    }
  });

  it("leaves out a section the reader took out, appendix included", async () => {
    const all = await reportFigures(repo, query("en"), null, new Set());
    const writable = all.report.sections.find(
      (section) => section.availability !== "unavailable" && section.id !== "evidence-appendix",
    );
    expect(writable).toBeDefined();
    const { rows } = await reportFigures(repo, query("en"), null, new Set([writable?.id ?? ""]));
    expect(rows.some((row) => row.section === writable?.label)).toBe(false);
    expect(rows.some((row) => row.figure === writable?.label)).toBe(false);
    expect(rows.length).toBeLessThan(all.rows.length);
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
    /* The register's visitor column is the one the CSV does not carry. */
    expect(rows.some((row) => row.figure.endsWith(" · Visitor"))).toBe(false);
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
