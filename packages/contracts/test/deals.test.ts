import { describe, expect, it } from "vitest";
import {
  CrmDealSchema,
  DealStageChangeSchema,
  ProjectIdSchema,
  TenantIdSchema,
  dealEventKey,
  diffDeals,
  mapStage,
  type CrmDeal,
} from "../src/index";

/**
 * The canonical deal and the fact between two snapshots.
 *
 * What must hold: a stage word is mapped by the table or carried raw as
 * null, never guessed; a deal that appears, moves or disappears yields one
 * fact each, in a stable order; an unchanged word is silent even if the
 * mapping moved; the event key is a function of scope, deal, kind, word and
 * time and nothing else; and no personal data has a place in the shape.
 */

const SCOPE = {
  tenantId: TenantIdSchema.parse("tnt_aabbccdd11"),
  projectId: ProjectIdSchema.parse("prj_istertower1"),
  connector: "lomnio" as const,
};
const KEY = "a".repeat(64);
const FETCHED = "2026-09-07T10:00:00.000+00:00";

function deal(externalId: string, over: Partial<CrmDeal> = {}): CrmDeal {
  return {
    externalId,
    unitCode: "A-101",
    subjectKey: KEY,
    stage: "meeting",
    stageRaw: "schuzka",
    stageEnteredAt: null,
    openedAt: "2026-09-01T09:00:00.000+00:00",
    updatedAt: null,
    won: null,
    lost: null,
    ...over,
  };
}

describe("mapStage", () => {
  const table = { schuzka: "meeting", Nabidka: "offer", won: "purchase" } as const;
  it("maps exactly, then case-insensitively, then to null", () => {
    expect(mapStage("schuzka", table)).toBe("meeting");
    expect(mapStage(" NABIDKA ", table)).toBe("offer");
    expect(mapStage("Won", table)).toBe("purchase");
    expect(mapStage("rezervace", table)).toBeNull();
  });
});

describe("CrmDeal", () => {
  it("has no field for a name, an email or a phone number", () => {
    const keys = Object.keys(CrmDealSchema.shape);
    expect(keys).not.toEqual(expect.arrayContaining(["email", "phone", "name", "customer"]));
    expect(keys).toContain("subjectKey");
    expect(CrmDealSchema.safeParse({ ...deal("d1"), email: "x@y" }).success).toBe(false);
    expect(CrmDealSchema.safeParse(deal("d1", { subjectKey: "not-a-hash" })).success).toBe(false);
  });
});

describe("diffDeals", () => {
  it("yields opened, stage_changed and withdrawn facts, in a stable order", () => {
    const previous = [deal("d2"), deal("d1"), deal("d3", { stageRaw: "nabidka", stage: "offer" })];
    const next = [
      deal("d1", {
        stageRaw: "nabidka",
        stage: "offer",
        stageEnteredAt: "2026-09-06T08:00:00.000+00:00",
      }),
      deal("d4", { stageRaw: "novy", stage: null }),
      deal("d2"),
    ];
    const changes = diffDeals(previous, next, FETCHED);
    expect(changes.map((c) => [c.externalId, c.kind, c.fromRaw, c.toRaw, c.at])).toEqual([
      ["d1", "stage_changed", "schuzka", "nabidka", "2026-09-06T08:00:00.000+00:00"],
      ["d4", "opened", null, "novy", FETCHED],
      ["d3", "withdrawn", "nabidka", null, FETCHED],
    ]);
    expect(changes[1]).toMatchObject({ to: null, toRaw: "novy", observedAt: FETCHED });
    expect(changes[2]).toMatchObject({ from: "offer", to: null });
  });

  it("stays silent when the word is unchanged, even if the mapping changed", () => {
    const previous = [deal("d1", { stage: null })];
    const next = [deal("d1", { stage: "meeting" })];
    expect(diffDeals(previous, next, FETCHED)).toEqual([]);
  });

  it("validates as the stored fact once an id is added", () => {
    const [change] = diffDeals([], [deal("d9")], FETCHED);
    expect(DealStageChangeSchema.safeParse({ ...change, eventId: "b".repeat(64) }).success).toBe(
      true,
    );
    expect(DealStageChangeSchema.safeParse({ ...change, eventId: "short" }).success).toBe(false);
  });
});

describe("dealEventKey", () => {
  it("is a function of scope, deal, kind, the word moved to and the time", () => {
    const [change] = diffDeals([], [deal("d1")], FETCHED);
    if (change === undefined) throw new Error("no change");
    const key = dealEventKey(SCOPE, change);
    expect(key).toBe(
      [
        "deal.stage.changed",
        SCOPE.tenantId,
        SCOPE.projectId,
        "lomnio",
        "d1",
        "opened",
        "schuzka",
        FETCHED,
      ].join("\u0000"),
    );
    expect(dealEventKey({ ...SCOPE, connector: "monday" }, change)).not.toBe(key);
    expect(dealEventKey(SCOPE, { ...change, at: "2026-09-08T10:00:00.000+00:00" })).not.toBe(key);
    // The subject and the unit are not in the key: a corrected mapping or a
    // re-hashed subject must not make a second fact out of the same move.
    expect(dealEventKey(SCOPE, { ...change, subjectKey: null, unitCode: null })).toBe(key);
  });
});
