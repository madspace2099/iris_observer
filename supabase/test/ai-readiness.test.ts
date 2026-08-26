import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The AI-readiness gate, and why it is a separate file from the compatibility
 * proof.
 *
 * The compatibility proof accepts `model`, `deterministic_composer`, `refusal`
 * or `failure` in `response_source`, and that is correct for its question: it
 * asks whether the DEPLOYED BUILD wrote the audit row it was supposed to write
 * through PostgREST after the signature changed, and a deterministic-composer
 * answer proves that just as well.
 *
 * It is not evidence that live AI works. Observer answers without a model by
 * design — the deterministic composer runs the same tools over the same
 * evidence — so a deployment with no `OPENAI_API_KEY` answers every question
 * and reads 13/13 on the compatibility proof while never calling a model.
 *
 * Telling Matthew "the AI is working" on that evidence would be false. This
 * gate exists so the two states cannot be confused, and it says the honest
 * sentence for the second one in its own output.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const GATE = join(import.meta.dirname, "..", "verifiers", "observer-ai-readiness.sql");

const CONTRACT = "20260826090000_observer_audit_facade_cleanup.sql";
const RETENTION = "20260826140000_observer_bucket_retention.sql";
const KEY_ID = "0123456789abcdef";
const GATE_SQL = readFileSync(GATE, "utf8");

const ID = "aaaaaaaa-0000-4000-8000-00000000000a";
const OTHER = "bbbbbbbb-0000-4000-8000-00000000000b";

interface Row {
  readonly "#": number;
  readonly check: string;
  readonly expected: string;
  readonly actual: string;
  readonly verdict: string;
}

/** The operator's file with its one parameter substituted. */
function query(requestId: string): string {
  const start = GATE_SQL.indexOf("with params as (");
  const end = GATE_SQL.indexOf(" order by ord;", start);
  if (start < 0 || end < 0) throw new Error("query not found in the gate file");
  const text = GATE_SQL.slice(start, end + " order by ord;".length);
  const placeholder = "'00000000-0000-0000-0000-000000000000'::uuid";
  if (!text.includes(placeholder)) throw new Error("the request-id placeholder is gone");
  return text.replace(placeholder, `'${requestId}'::uuid`);
}

async function database(): Promise<PGlite> {
  const db = await new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (file === CONTRACT || file === RETENTION) continue;
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

type Completion = {
  readonly source: string;
  readonly attemptedModel: string | null;
  readonly modelAttempted: boolean;
  readonly modelAuthored: boolean;
  readonly authorModel: string | null;
  readonly fallback: string | null;
};

const MODEL_ANSWER: Completion = {
  source: "model",
  attemptedModel: "gpt-5.6-sol",
  modelAttempted: true,
  modelAuthored: true,
  authorModel: "gpt-5.6-sol",
  fallback: null,
};

const COMPOSER_ANSWER: Completion = {
  source: "deterministic_composer",
  attemptedModel: null,
  modelAttempted: false,
  modelAuthored: false,
  authorModel: null,
  fallback: "model_unavailable",
};

/** Admission only. The row exists and stays `started`. */
async function admit(db: PGlite, id: string): Promise<void> {
  await db.exec("set role service_role");
  await db.query(
    `select public.admit_ai_request($1, 'subject-x', 'global-hash', 'alpha/northgate',
       1000, 6000, 12000, 50000, 'alpha', 'northgate', 'agency_manager', 41, $2, $3, 2)`,
    [id, KEY_ID, `scoped-${id.slice(0, 8)}`],
  );
  await db.exec("reset role");
}

/** One admitted, completed request written through the real functions. */
async function ask(db: PGlite, id: string, c: Completion): Promise<void> {
  await admit(db, id);
  await db.exec("set role service_role");
  await db.query(
    `select public.complete_ai_request($1, 'answered', $2, 'openai', $3, $4, $5, $6, $7,
       '{summarize_showroom_period}', 1, 900, 120, 4300)`,
    [id, c.source, c.attemptedModel, c.modelAttempted, c.modelAuthored, c.authorModel, c.fallback],
  );
  await db.exec("reset role");
}

async function gate(db: PGlite, requestId: string): Promise<readonly Row[]> {
  return (await db.query<Row>(query(requestId))).rows;
}

const failed = (rows: readonly Row[]) =>
  rows.filter((r) => r.verdict === "FAIL").map((r) => r["#"]);
const at = (rows: readonly Row[], n: number) => rows.find((r) => r["#"] === n);

describe("a model-authored answer passes the gate", () => {
  it("reads a complete pass and says live AI is answering", async () => {
    const db = await database();
    await ask(db, ID, MODEL_ANSWER);

    const rows = await gate(db, ID);
    expect(rows).toHaveLength(11);
    expect(failed(rows)).toEqual([]);
    expect(at(rows, 11)?.actual).toBe("live AI is answering");
  });

  it("names the model that wrote it, which is configuration and not a secret", async () => {
    const db = await database();
    await ask(db, ID, MODEL_ANSWER);

    const rows = await gate(db, ID);
    expect(at(rows, 10)?.actual).toBe("gpt-5.6-sol");
    expect(at(rows, 9)?.actual).toBe("openai");
  });
});

describe("a deterministic answer fails it, and says so honestly", () => {
  it("reports that the application works but live AI is not enabled", async () => {
    /*
     * The sentence that matters. This deployment answers every question and
     * renders every figure; it just never called a model. Reporting it as
     * working AI would be the false claim this gate exists to prevent.
     */
    const db = await database();
    await ask(db, ID, COMPOSER_ANSWER);

    const rows = await gate(db, ID);
    expect(at(rows, 11)?.actual).toBe("Observer application works, but live AI is not yet enabled");
    /*
     * 3 source, 4 attempted, 5 authored, 6 a fallback reason is present,
     * 7 no author named, 11 the verdict.
     *
     * Row 10 PASSES here, and correctly: it compares the attempted model with
     * the authoring one, and a composer answer attempted nothing and authored
     * nothing. Consistent is not the same as live, which is what row 11 is for.
     */
    expect(failed(rows)).toEqual([3, 4, 5, 6, 7, 11]);
  });

  it("would have passed the compatibility proof on the same row", async () => {
    /*
     * The whole reason for two files. `deterministic_composer` is one of the
     * four values the compatibility proof accepts, so that proof reads 13/13
     * on exactly this database.
     */
    const compat = readFileSync(
      join(import.meta.dirname, "..", "verifiers", "observer-http-compat-proof.sql"),
      "utf8",
    );
    expect(compat).toContain("'model', 'deterministic_composer', 'refusal', 'failure'");
  });
});

describe("the gate refuses to guess", () => {
  it("FAILS when the id matches no row", async () => {
    const db = await database();
    await ask(db, ID, MODEL_ANSWER);

    const rows = await gate(db, OTHER);
    expect(at(rows, 1)?.actual).toBe("0 — check the header you pasted");
    expect(failed(rows)).toContain(1);
    expect(at(rows, 11)?.actual).toBe("Live AI is not proven — see the failed checks");
  });

  /*
   * Row 11 is a sentence a person reads and acts on, so it gets its own block.
   *
   * Each row below is labelled `model` and contradicted by another column. The
   * previous verdict looked at two of the ten conditions — `response_source`
   * and `model_authored` — so every one of these produced "live AI is
   * answering" while the eleven-row result failed. The number failed; the
   * sentence lied.
   */
  const INCONSISTENT: readonly { name: string; c: Completion }[] = [
    {
      name: "the credited model is not the attempted one",
      c: { ...MODEL_ANSWER, attemptedModel: "gpt-4o-mini" },
    },
    {
      name: "a fallback reason sits beside a model answer",
      c: { ...MODEL_ANSWER, fallback: "output_guard" },
    },
    { name: "the author model is empty", c: { ...MODEL_ANSWER, authorModel: "" } },
  ];

  /*
   * Two combinations are missing from that list on purpose, and the reason is
   * better than the test would have been: the DATABASE refuses them outright.
   * `ai_requests_authorship_coherent` rejects a model credited but never
   * attempted, and `model` as a source with `model_authored = false`. They can
   * never reach the verifier because they can never be stored.
   */
  it("cannot even store a model credited without an attempt", async () => {
    const db = await database();
    await expect(ask(db, ID, { ...MODEL_ANSWER, modelAttempted: false })).rejects.toThrow(
      /ai_requests_authorship_coherent/,
    );
  });

  it("cannot even store `model` as a source with authorship false", async () => {
    const db = await database();
    await expect(ask(db, ID, { ...MODEL_ANSWER, modelAuthored: false })).rejects.toThrow(
      /ai_requests_authorship_coherent/,
    );
  });

  for (const scenario of INCONSISTENT) {
    it(`never says live AI is answering when ${scenario.name}`, async () => {
      const db = await database();
      await ask(db, ID, scenario.c);

      const rows = await gate(db, ID);
      expect(at(rows, 11)?.actual).toBe("Live AI is not proven — see the failed checks");
      expect(failed(rows).length).toBeGreaterThan(0);
    });
  }

  it("never says live AI is answering for an unknown request id", async () => {
    const db = await database();
    await ask(db, ID, MODEL_ANSWER);

    const rows = await gate(db, OTHER);
    expect(at(rows, 11)?.actual).toBe("Live AI is not proven — see the failed checks");
  });

  it("never says live AI is answering for an incomplete row", async () => {
    // Admitted and never completed: the row is `started`, which is the honest
    // record of a request that produced no answer.
    const db = await database();
    await admit(db, ID);

    const rows = await gate(db, ID);
    expect(at(rows, 2)?.actual).toBe("started");
    expect(at(rows, 11)?.actual).toBe("Live AI is not proven — see the failed checks");
  });

  it("never says live AI is answering for the wrong provider", async () => {
    /*
     * `evidence-only` is what the deployment reports when no key is
     * configured. A row naming it as the provider while crediting a model is
     * describing something that did not happen.
     */
    const db = await database();
    await admit(db, ID);
    await db.exec("set role service_role");
    await db.query(
      `select public.complete_ai_request($1, 'answered', 'model', 'evidence-only', 'gpt-5.6-sol',
         true, true, 'gpt-5.6-sol', null, '{summarize_showroom_period}', 1, 900, 120, 4300)`,
      [ID],
    );
    await db.exec("reset role");

    const rows = await gate(db, ID);
    expect(at(rows, 9)?.actual).toBe("evidence-only");
    expect(at(rows, 11)?.actual).toBe("Live AI is not proven — see the failed checks");
  });

  it("FAILS a refusal or a failure, not only a composer answer", async () => {
    const db = await database();
    await ask(db, ID, {
      source: "failure",
      attemptedModel: "gpt-5.6-sol",
      modelAttempted: true,
      modelAuthored: false,
      authorModel: null,
      fallback: "model_unavailable",
    });

    const rows = await gate(db, ID);
    expect(at(rows, 11)?.actual).toBe("Live AI is not proven — see the failed checks");
    expect(failed(rows)).toContain(3);
  });

  it("FAILS a row crediting a model it did not attempt", async () => {
    /*
     * The audit rebuild's original defect, checked from the other side: a row
     * naming one model as attempted and another as the author is describing two
     * different events.
     */
    const db = await database();
    await ask(db, ID, { ...MODEL_ANSWER, attemptedModel: "gpt-4o-mini" });

    const rows = await gate(db, ID);
    expect(failed(rows)).toContain(8);
    expect(at(rows, 8)?.actual).toBe("false");
  });

  it("prints no identifier", async () => {
    const db = await database();
    await ask(db, ID, MODEL_ANSWER);

    const rendered = JSON.stringify(await gate(db, ID));
    expect(rendered).not.toContain(ID);
    expect(rendered).not.toContain("subject-x");
    expect(rendered).not.toContain(KEY_ID);
    expect(rendered).not.toContain("global-hash");
  });
});
