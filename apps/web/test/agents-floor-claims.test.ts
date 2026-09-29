import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The agent surfaces draw no comparison below the floor — anywhere.
 *
 * The roster's radar, its workload list, the agent page's section sequence
 * and the report's agents table each drew a comparison or a median under the
 * floor while a region beside them withheld the same. These are the print
 * sites; the read-model side is `agent-charts-floor.test.ts`.
 *
 * Source assertions on the JSX, comments stripped, as the other page-claim
 * tests do it: the pages are async server components behind the repository.
 */

const web = resolve(import.meta.dirname, "..");
const markup = (path: string): string =>
  readFileSync(resolve(web, path), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const ROSTER = markup("src/app/(app)/[tenantSlug]/[projectSlug]/agents/page.tsx");
const DETAIL = markup("src/app/(app)/[tenantSlug]/[projectSlug]/agents/[agentId]/page.tsx");
/* The head's sentence lives in `agentAnswer`, shared with the printed summary; the page calls it. */
const ANSWER = markup("src/components/agents/answer.ts");
const REPORT = markup("src/app/(app)/[tenantSlug]/[projectSlug]/report/page.tsx");
const SEQUENCE = markup("src/showroom/charts2.tsx");

describe("the roster", () => {
  it("gates 'leans on' on the timed set, and prints the read model's reason under it", () => {
    expect(
      ROSTER,
      "'leans on' stands on the timed set under a gate that counts the meetings held",
    ).toMatch(
      /a\.belowMinimum \? null : a\.signatureNote !== null \? \([\s\S]*?\{a\.signatureNote\}/,
    );
  });

  it("withholds the radar shape under the floor and prints the note", () => {
    expect(ROSTER, "a radar shape is drawn whatever the sample").toMatch(
      /profile\.belowMinimum \? \([\s\S]*?\{profile\.note\}[\s\S]*?\) : \([\s\S]*?<Radar/,
    );
  });
});

describe("the agent page's head", () => {
  it("prints the read model's reason where the habit's timed set is under the floor", () => {
    expect(ANSWER, "the head reads a habit under a gate that counted the meetings held").toMatch(
      /view\.suppressionNote \?\?[\s\S]*?view\.profile\.signatureNote \?\?/,
    );
  });
});

describe("the agent page's section sequence", () => {
  it("asks for the team's median only where the floor is cleared", () => {
    expect(DETAIL).toContain("showTeam={!view.belowMinimum}");
  });

  it("keeps the team out of the screen reader's summary under the floor", () => {
    expect(DETAIL, "the summary says 'team median' whatever the sample").toMatch(
      /view\.belowMinimum \? "" : `, team median/,
    );
  });

  it("says why the team's median is missing", () => {
    expect(DETAIL).toContain("not printed beside their stops");
  });

  it("prints the team's median only when asked", () => {
    expect(SEQUENCE, "the sequence prints the team's median whatever the page asked").toMatch(
      /showTeam \? <em>team \{row\.teamDwellDisplay\}<\/em> : null/,
    );
  });
});

describe("the report's agents table", () => {
  it("withholds the median under the floor", () => {
    expect(REPORT).toMatch(/duration: agent\.belowMinimum \?/);
  });

  it("withholds the rate under the floor", () => {
    expect(REPORT).toMatch(/progressed: agent\.belowMinimum \?/);
  });
});
