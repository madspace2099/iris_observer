import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_DETAIL_ROUTE,
  REPLAY_ROUTE,
  agentDetailHref,
  replayHref,
} from "@observer/readmodels";

import { SURFACES } from "@/lib/routes";

/**
 * LINKS FROM THE ROUTE MAP (R08-6, DONTESEK1, Máté 2026-10-02).
 *
 * A replay and an agent's page are linked from one pattern each, the pattern
 * the route map declares, with every identifier encoded. A link written out by
 * hand would go back to drifting from the map, so the source is held to it.
 */
const AT = { tenantSlug: "alpha", projectSlug: "northgate" };

describe("a link built from the route map", () => {
  it("fills the replay and agent patterns, encoding each identifier", () => {
    expect(replayHref(AT, "mtg_ng0132")).toBe("/alpha/northgate/meetings/mtg_ng0132");
    expect(agentDetailHref(AT, "agt_akhilesh")).toBe("/alpha/northgate/agents/agt_akhilesh");
    expect(replayHref(AT, "a b/c?d")).toBe("/alpha/northgate/meetings/a%20b%2Fc%3Fd");
    expect(agentDetailHref({ tenantSlug: "t/1", projectSlug: "p 2" }, "x")).toBe(
      "/t%2F1/p%202/agents/x",
    );
  });

  it("is the pattern the route map declares for those surfaces", () => {
    const routes = SURFACES.map((s) => s.route);
    expect(routes).toContain(REPLAY_ROUTE);
    expect(routes).toContain(AGENT_DETAIL_ROUTE);
  });

  it("is the only way the source links a replay or an agent's page", () => {
    const roots = ["../src", "../../../packages/synthetic/src"].map((r) =>
      resolve(import.meta.dirname, r),
    );
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const handWritten = roots
      .flatMap(walk)
      .filter((f) => /\.tsx?$/.test(f))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => [f, i + 1, line] as const),
      )
      .filter(([, , line]) => /\/(meetings|agents)\/\$\{/.test(line))
      .map(([f, n, line]) => `${f.slice(f.lastIndexOf("src"))}:${String(n)}  ${line.trim()}`);
    expect(handWritten).toEqual([]);
  });
});
