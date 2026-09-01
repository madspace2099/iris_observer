#!/usr/bin/env node
/**
 * DO THE CONTRACT TESTS ACTUALLY DETECT A BROKEN CONTRACT?
 *
 *   node scripts/contracts/positive-control.mjs
 *
 * A green suite proves that the code passes the tests. It does not prove that
 * the tests would notice if the code were wrong, and those are different claims
 * — the second one is the one anybody actually cares about. Every suite that has
 * ever silently stopped testing anything was green on the day it stopped.
 *
 * So: break the contract on purpose, one defect at a time, and require the
 * relevant tests to fail. A mutation that changes nothing is reported as a
 * **gap**, not as a pass.
 *
 * ## Nothing is left behind
 *
 * Each mutation is applied to a file, the suite runs, and the file is restored
 * from the bytes read before the edit. The SHA-256 of every touched file is
 * recorded before and after and compared at the end; if a single one differs the
 * run reports a dirty tree and exits non-zero. A positive-control harness that
 * can leave a mutation in the working tree is worse than no harness at all.
 *
 * The report is written to `artifacts/ue5-contract/positive-control.json`, which
 * is git-ignored: it is generated evidence, not part of the repository.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT_TESTS = "packages/contracts/test/ue5";
const MOCK_TESTS = "packages/ue5-mock/test";

/**
 * The defects. Each one is a plausible mistake rather than a contrived one —
 * something a hurried change or a merge could genuinely produce.
 */
const MUTATIONS = [
  {
    id: "client-supplied-project-id",
    defect: "Allow a client to set `project_id` in event properties.",
    breaks: "LOCKED §3.2, §4.2, §9.2 — the backend derives identity from the credential.",
    file: "packages/contracts/src/ue5/ingestion.ts",
    find: '  "project_id",\n',
    replace: "",
    targets: [CONTRACT_TESTS, MOCK_TESTS],
  },
  {
    id: "duplicate-becomes-accepted",
    defect: "Report a replayed event as accepted rather than duplicate.",
    breaks: "LOCKED §5.4, §5.5 — a replay must never look like a new fact.",
    file: "packages/ue5-mock/src/backend.ts",
    find: '          status: "duplicate",',
    replace: '          status: "accepted",',
    targets: [MOCK_TESTS],
  },
  {
    id: "required-field-removed",
    defect: "Drop `installation_nonce` from the activation request.",
    breaks: "LOCKED §9.1 — repeat activation must be detectable.",
    file: "packages/contracts/src/ue5/activation.ts",
    find: "  installation_nonce: WireUuidSchema,\n",
    replace: "",
    targets: [CONTRACT_TESTS, MOCK_TESTS],
  },
  {
    id: "unknown-code-retryable",
    defect: "Treat an unrecognised rejection code as retryable.",
    breaks: "A client would retry an event it cannot interpret, for ever.",
    file: "packages/contracts/src/ue5/errors.ts",
    find: "export const UNKNOWN_CODE_POLICY: FailurePolicy = Object.freeze({\n  retryable: false,",
    replace:
      "export const UNKNOWN_CODE_POLICY: FailurePolicy = Object.freeze({\n  retryable: true,",
    targets: [CONTRACT_TESTS],
  },
  {
    id: "unsupported-schema-accepted",
    defect: "Accept an event whose schema version is outside the supported range.",
    breaks: "The support window becomes unenforceable.",
    file: "packages/contracts/src/ue5/validation.ts",
    find:
      "    event.schema_version < context.acceptedSchemaVersions.min ||\n" +
      "    event.schema_version > context.acceptedSchemaVersions.max",
    replace: "    false ||\n    false",
    targets: [CONTRACT_TESTS, MOCK_TESTS],
  },
  {
    id: "global-deduplication",
    defect: "Deduplicate on `event_id` alone, across every source.",
    breaks: "A duplicate answer becomes a cross-tenant existence oracle.",
    file: "packages/ue5-mock/src/backend.ts",
    find: "      const key = `${source.sourceId}::${raw.event_id}`;",
    replace: "      const key = raw.event_id;",
    targets: [MOCK_TESTS],
  },
  {
    id: "batch-validates-events",
    defect: "Validate every event while parsing the batch frame.",
    breaks: "LOCKED §9.2 — one bad event would fail the whole batch, destroying partial success.",
    file: "packages/contracts/src/ue5/ingestion.ts",
    find: "  events: z.array(EventKeySchema),\n});\nexport type BatchFrame",
    replace: "  events: z.array(EventEnvelopeSchema),\n});\nexport type BatchFrame",
    targets: [CONTRACT_TESTS, MOCK_TESTS],
  },
  {
    id: "unauthorised-discards-outbox",
    defect: "Quarantine the batch on 401 instead of retaining it.",
    breaks:
      "LOCKED §5.5 — the events are not the problem. This is the mistake that turns a " +
      "five-minute operator task into permanent data loss.",
    file: "packages/contracts/src/ue5/errors.ts",
    find:
      '    meaning: "The credential is unknown, malformed, revoked or superseded.",\n' +
      "    retryable: false,\n" +
      '    outbox: "retain",',
    replace:
      '    meaning: "The credential is unknown, malformed, revoked or superseded.",\n' +
      "    retryable: false,\n" +
      '    outbox: "quarantine",',
    targets: [CONTRACT_TESTS],
  },
  {
    id: "size-checked-before-depth",
    defect: "Drop the depth guard that has to run before the size check.",
    breaks:
      "The size check serialises and serialisation recurses, so the guard against a hostile " +
      "payload is crashed by one. This is a real defect that was shipped and caught once.",
    file: "packages/contracts/src/ue5/validation.ts",
    find: "  if (depth > context.limits.maxPropertyDepth + 2) {",
    replace: "  if (depth > 1_000_000) {",
    targets: [CONTRACT_TESTS],
  },
  {
    id: "event-cap-raised-above-64k",
    defect: "Raise the per-event ceiling above the approved 64 KiB.",
    breaks: "PD-03 — 64 KiB is the approved V1 cap on both sides, and a gap helps nobody.",
    file: "packages/contracts/src/ue5/client-config.ts",
    find: "  maxEventBytes: 65_536,",
    replace: "  maxEventBytes: 131_072,",
    targets: [CONTRACT_TESTS],
  },
  {
    id: "caller-controlled-sequence",
    defect: "Let a caller set its own `sequence` inside event properties.",
    breaks:
      "PD-04 — a second, unauthoritative ordering beside the real one, leaving a read model " +
      "with two answers to the same question.",
    file: "packages/contracts/src/ue5/ingestion.ts",
    find: '  "session_id",\n  "sequence",\n] as const;',
    replace: '  "session_id",\n] as const;',
    targets: [CONTRACT_TESTS],
  },
  {
    id: "401-discards-the-outbox",
    defect: "Let a 401 erase the queued events instead of retaining them.",
    breaks:
      "PD-05 and LOCKED §5.5 — the events are not the problem. This turns a five-minute " +
      "operator task into permanent data loss.",
    file: "packages/contracts/src/ue5/outbox.ts",
    find: '    return verdict("quarantined", policy.sending, "the request itself was wrong");',
    replace:
      '    return verdict("quarantined", policy.sending, "the request itself was wrong", true);',
    targets: [CONTRACT_TESTS],
  },
  {
    id: "retry-exhaustion-deletes",
    defect: "Delete an event once its retry attempts are exhausted.",
    breaks:
      "The durable outbox contract, in exactly the circumstances it exists for: a showroom " +
      "offline all afternoon fails far more than five times.",
    file: "packages/contracts/src/ue5/outbox.ts",
    find:
      '    "the configured attempt sequence is exhausted; the event is preserved and surfaced, never erased",\n' +
      "  );",
    replace:
      '    "the configured attempt sequence is exhausted; the event is preserved and surfaced, never erased",\n' +
      "    true,\n  );",
    targets: [CONTRACT_TESTS],
  },
  {
    id: "plaintext-marked-production-safe",
    defect: "Allow a production package to persist a plaintext credential.",
    breaks:
      "PD-06 — it lowers the bar from extracting a secret out of a packaged binary to reading " +
      "a file, and those are different threats.",
    file: "packages/contracts/src/ue5/credential.ts",
    find: '  if (policy.mode === "plaintext_development") {',
    replace: "  if (false) {",
    targets: [CONTRACT_TESTS],
  },
];

const sha = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function runTests(targets) {
  const outcome = spawnSync(
    process.execPath,
    [join(ROOT, "node_modules", "vitest", "vitest.mjs"), "run", ...targets, "--reporter=basic"],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: undefined } },
  );
  /*
   * ANSI first. Vitest colours its summary, so `Tests  1 failed` is really
   * an escape sequence, a bold marker, a red marker and then `1 failed`, and a
   * regex over the raw stream matches nothing — which is how this harness first
   * reported "0 tests failed" for seven defects it had correctly caught. A
   * parser that silently finds nothing looks exactly like a suite that found
   * nothing.
   *
   * The escape is built from its code point rather than typed. A literal one in
   * the source is a control byte in the repository, and the release suite
   * refuses those — correctly, and it caught this one.
   */
  const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
  const output = `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`.replace(ANSI, "");
  const failed = /Tests\s+(\d+)\s+failed/.exec(output)?.[1];
  const files = [...output.matchAll(/FAIL\s+(\S+\.test\.ts)/g)].map((match) => match[1]);
  return {
    exitCode: outcome.status ?? -1,
    failedTests: failed === undefined ? 0 : Number.parseInt(failed, 10),
    failingFiles: [...new Set(files)],
  };
}

function main() {
  console.log("positive control — breaking the contract on purpose, one defect at a time\n");

  const baseline = runTests([CONTRACT_TESTS, MOCK_TESTS]);
  if (baseline.exitCode !== 0) {
    console.error("the suite is not green before any mutation; fix that first");
    process.exit(1);
  }
  console.log(`baseline: green\n`);

  const before = new Map();
  const results = [];
  let gaps = 0;

  for (const mutation of MUTATIONS) {
    const path = join(ROOT, mutation.file);
    const original = readFileSync(path, "utf8");
    if (!before.has(path)) before.set(path, sha(original));

    const occurrences = original.split(mutation.find).length - 1;
    if (occurrences !== 1) {
      console.error(`  ${mutation.id}: anchor matched ${occurrences} times — cannot mutate safely`);
      process.exit(1);
    }

    writeFileSync(
      path,
      original.replace(mutation.find, () => mutation.replace),
      "utf8",
    );
    let outcome;
    try {
      outcome = runTests(mutation.targets);
    } finally {
      writeFileSync(path, original, "utf8");
    }

    const caught = outcome.exitCode !== 0;
    if (!caught) gaps += 1;
    results.push({
      id: mutation.id,
      defect: mutation.defect,
      breaks: mutation.breaks,
      file: mutation.file,
      caught,
      failedTests: outcome.failedTests,
      failingFiles: outcome.failingFiles,
    });

    const mark = caught ? "caught" : "NOT CAUGHT";
    const detail = caught
      ? `${outcome.failedTests} test(s) failed in ${outcome.failingFiles.join(", ") || "the suite"}`
      : "the suite stayed green — this defect is not covered";
    console.log(`  ${mark.padEnd(10)} ${mutation.id}: ${detail}`);
  }

  /* The tree must be exactly as it was found. */
  const dirty = [];
  for (const [path, digest] of before) {
    if (sha(readFileSync(path, "utf8")) !== digest) dirty.push(path);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mutations: results.length,
    caught: results.filter((result) => result.caught).length,
    gaps,
    treeRestored: dirty.length === 0,
    dirtyFiles: dirty,
    results,
  };

  const out = join(ROOT, "artifacts", "ue5-contract");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "positive-control.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`  ${report.caught}/${report.mutations} defects caught`);
  console.log(`  working tree restored: ${report.treeRestored ? "yes" : "NO"}`);
  console.log("  report: artifacts/ue5-contract/positive-control.json");

  if (dirty.length > 0) {
    console.error(`\nmutations were left in the working tree: ${dirty.join(", ")}`);
    process.exit(2);
  }

  const verify = runTests([CONTRACT_TESTS, MOCK_TESTS]);
  if (verify.exitCode !== 0) {
    console.error("\nthe suite is not green after restoration");
    process.exit(3);
  }
  console.log("  suite green again after restoration");
  process.exit(gaps === 0 ? 0 : 4);
}

main();
