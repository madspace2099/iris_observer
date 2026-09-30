import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_MAPPING_STATES } from "../../scripts/release/preflight";

/**
 * THE DEPLOYMENT GUIDE'S STEP 1 TABLE IS THE PREFLIGHT TABLE (CONF2, 2026-09-30).
 *
 * `preflight.ts` keeps the verdicts in one place "because four copies of a rule
 * are four chances to disagree", and `docs/18-deployment.md` then carried a
 * fifth copy by hand. Two remedies and the order had already drifted from the
 * table when this was written. The table is the source; this reads the guide's
 * markdown table and holds it to the table row by row — name, condition,
 * verdict and remedy, in the table's order.
 *
 * Only markdown decoration is set aside before comparing: backticks and bold.
 * Every word, and every character of punctuation, has to match.
 */

const GUIDE = resolve(import.meta.dirname, "../../docs/18-deployment.md");
const HEADING = "#### Every state, and what it means for the rollout";

interface GuideRow {
  readonly name: string;
  readonly condition: string;
  readonly verdict: string;
  readonly remedy: string;
}

const plain = (cell: string): string => cell.replace(/`/g, "").replace(/\*\*/g, "").trim();

function guideRows(): readonly GuideRow[] {
  const text = readFileSync(GUIDE, "utf8");
  const start = text.indexOf(HEADING);
  if (start < 0) throw new Error(`the guide has no "${HEADING}" section`);
  const lines = text.slice(start + HEADING.length).split("\n");
  const first = lines.findIndex((l) => l.startsWith("|"));
  const table = lines
    .slice(first)
    .filter((_, i, all) => all.slice(0, i + 1).every((l) => l.startsWith("|")));
  /* The header row and the separator row, then one row per state. */
  return table.slice(2).map((row) => {
    const cells = row.split("|").slice(1, -1).map(plain);
    if (cells.length !== 4) throw new Error(`a row without four cells: ${row}`);
    const [name = "", condition = "", verdict = "", remedy = ""] = cells;
    return { name, condition, verdict, remedy };
  });
}

describe("the deployment guide's step 1 table is the preflight table", () => {
  const rows = guideRows();

  it("finds the table, and a row for every state", () => {
    expect(rows.length).toBe(PROJECT_MAPPING_STATES.length);
  });

  it("names the states in the table's order", () => {
    expect(rows.map((r) => r.name)).toEqual(PROJECT_MAPPING_STATES.map((s) => s.name));
  });

  it.each(PROJECT_MAPPING_STATES.map((s) => [s.name, s] as const))(
    "%s: the same condition, verdict and remedy",
    (name, state) => {
      const row = rows.find((r) => r.name === name);
      expect(row).toEqual({
        name: state.name,
        condition: state.condition,
        verdict: state.verdict,
        remedy: state.remedy,
      });
    },
  );
});
