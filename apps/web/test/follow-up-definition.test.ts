import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FOLLOW_UP_LABELS, visitorLabel, DEFAULT_LANGUAGE } from "@observer/readmodels";
import { SyntheticObserverRepository, VIEWERS } from "@observer/synthetic";

/**
 * A FOLLOW-UP THAT WAS NOT RECORDED IS NOT A FOLLOW-UP THAT DID NOT HAPPEN.
 *
 * Observer reads the outcome the agent recorded at the end of the meeting. It
 * does not see the call afterwards, the message, or the conversation in the car
 * park, and no source in this phase carries one (`FOLLOW_UP_STATES`,
 * `packages/readmodels/src/screens.ts`). The metric behind every figure here is
 * careful about it: `people.follow_up_delay` measures days to the next
 * *recorded* contact and needs `activity.occurred_at` from a CRM to do it.
 *
 * The copy was not. Two surfaces dropped the word and turned a gap in the
 * record into a statement about what a person did: a buyer "waiting for a
 * reply", prospects with "no contact since their meeting", and — the one that
 * cost the most — an empty list captioned "Every buyer has been contacted since
 * their meeting", which is a claim Observer has no way to check and no way to
 * be right about.
 *
 * So this file holds the definition rather than the wording. A surface may say
 * a contact is not recorded. It may never say a contact did not happen, that
 * somebody is waiting, or that everybody has been reached. The distinction is
 * also what keeps the three follow-up states three states, and keeps a CRM out
 * of all of them: the follow-up is read off the outcome the agent recorded in
 * the room, so "outcome not recorded" is a fact about the record and never a
 * fact about an integration. A fourth state, "no CRM connected", used to stand
 * beside these; it said the CRM produced a fact the showroom had, and it is gone.
 */

const ROOT = resolve(import.meta.dirname, "../../..");

/** Every source root whose strings a customer can read. */
const SOURCE_ROOTS = [
  join(ROOT, "apps", "web", "src"),
  join(ROOT, "packages", "readmodels", "src"),
  join(ROOT, "packages", "synthetic", "src"),
];

/**
 * Wordings that assert something about contact rather than about the record.
 *
 * Each is matched against source text, comments included: a comment that
 * teaches the wrong definition is how the wording comes back. Every one of
 * these was live in this repository before P1-04.
 */
const CLAIMS_CONTACT_HAPPENED = [
  /\bhas been contacted\b/i,
  /\bhave been contacted\b/i,
  /\buncontacted\b/i,
  /\bno contact since\b/i,
  /\bfor a reply\b/i,
  /\bnobody is waiting\b/i,
  /\bhas been waiting\b/i,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("what a missing follow-up means", () => {
  it("never claims a contact happened, or did not, anywhere a reader can see", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const path of sourceFiles(root)) {
        const text = readFileSync(path, "utf8");
        for (const pattern of CLAIMS_CONTACT_HAPPENED) {
          const hit = pattern.exec(text);
          if (hit !== null) {
            offenders.push(`${relative(ROOT, path)}: ${hit[0]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("says the record is silent, not that the buyer was ignored", async () => {
    const repo = new SyntheticObserverRepository();
    const overview = await repo.getAgentOverview({
      viewer: VIEWERS.salesAgent,
      tenantSlug: "alpha",
      projectSlug: "northgate",
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });

    expect(overview.followUps.length).toBeGreaterThan(0);
    for (const item of overview.followUps) {
      // The reason may name the gap; it has to name the record that is silent.
      expect(item.reason).toMatch(/record/i);
    }

    // The verdict reads the same metric, so it carries the same limit.
    expect(overview.verdict.headline).toMatch(/record/i);
    const delay = overview.verdict.components.find((c) => c.metricId === "people.follow_up_delay");
    expect(delay).toBeDefined();
    expect(delay?.rule).toMatch(/record/i);
  });
});

describe("states that must never collapse into one another", () => {
  it("gives the three follow-up states three different words, none about a CRM", () => {
    const words = Object.values(FOLLOW_UP_LABELS);
    expect(new Set(words).size).toBe(words.length);

    // None of the three is about a system being absent. If "outcome not
    // recorded" ever says CRM, a project with a connected CRM and a sloppy
    // agent reads as a project with no integration.
    for (const word of words) expect(word).not.toMatch(/crm/i);
  });

  it("never renders an unidentified visitor as a missing integration", () => {
    const unlinked = visitorLabel("unlinked", null).display;

    // A walk-in nobody linked to a contact is a fact about this meeting. A
    // disconnected CRM is a fact about the whole project, and the two share no
    // wording — otherwise one broken integration reads as a room full of
    // strangers, and a room full of strangers reads as a broken integration.
    expect(unlinked).not.toMatch(/crm/i);
    for (const word of Object.values(FOLLOW_UP_LABELS)) {
      expect(unlinked).not.toBe(word);
    }
  });
});
