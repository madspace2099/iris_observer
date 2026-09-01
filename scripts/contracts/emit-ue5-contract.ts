import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildOpenApiDocument,
  componentJsonSchemas,
} from "../../packages/contracts/src/ue5/openapi";
import { EVENT_REJECTIONS, REQUEST_FAILURES } from "../../packages/contracts/src/ue5/errors";
import { LOCAL_VALIDATION_ORDER } from "../../packages/contracts/src/ue5/validation";
import {
  CONSENT_SETTING_MEANING,
  OUTBOX_CAPACITY_STATEMENT,
  PROPOSED_BACKEND_CEILINGS,
  UE_BATCH_RANGE,
  UE_CONFIGURABLE_SETTINGS,
  UE_OUTBOX_DIRECTORY,
  UE_V1_CLIENT_DEFAULTS,
  expectedEventCapacity,
  worstCaseEventCapacity,
} from "../../packages/contracts/src/ue5/client-config";
import {
  EVENT_LEAVES_PENDING_DELIVERY,
  EVENT_PRESERVED_NOT_RETRIED,
  EVENT_REMAINS_LOCALLY,
  RESTART_INVARIANTS,
  UNAUTHORISED_OUTBOX_BEHAVIOUR,
  outboxStateForEventResult,
  outboxStateForRequestFailure,
  outboxStateForTransportFailure,
} from "../../packages/contracts/src/ue5/outbox";
import {
  CLASSIFICATIONS,
  CONTRACT_RULES,
  classificationCounts,
} from "../../packages/contracts/src/ue5/traceability";
import { UE5_CONTRACT_STATUS, UE5_CONTRACT_VERSION } from "../../packages/contracts/src/ue5/wire";

/**
 * GENERATES THE PUBLISHED UE5 CONTRACT ARTEFACTS.
 *
 *   pnpm contracts:ue5
 *
 * Everything under `docs/ue5-contract/` is written from the Zod schemas and the
 * traceability table, never by hand. That is the same arrangement `pnpm matrix`
 * already uses for the measurement matrix, and for the same reason: a
 * description maintained beside an implementation is two things that agree until
 * somebody edits one of them.
 *
 * `generated.test.ts` regenerates all of it in memory and fails if the committed
 * files differ, so a schema change that is not accompanied by a regeneration
 * cannot reach a commit.
 *
 * Nothing here reaches a network, a database or a vendor. It reads TypeScript
 * and writes files.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "docs", "ue5-contract");

/** Everything the generator produces, as text, keyed by path under `OUT`. */
export function generatedArtefacts(): Map<string, string> {
  const files = new Map<string, string>();

  files.set("openapi.json", `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);

  for (const [name, schema] of Object.entries(componentJsonSchemas())) {
    files.set(
      `schemas/${name}.schema.json`,
      `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: `https://observer.madspace.dev/ue5/${UE5_CONTRACT_VERSION}/${name}.schema.json`, title: name, ...schema }, null, 2)}\n`,
    );
  }

  files.set("traceability.md", traceabilityMarkdown());
  files.set("error-model.md", errorModelMarkdown());
  files.set("validation-order.md", validationOrderMarkdown());
  files.set("outbox-states.md", outboxMarkdown());
  files.set("v1-settings.md", settingsMarkdown());
  return files;
}

function settingsMarkdown(): string {
  const lines: string[] = [BANNER("V1 operating parameters")];

  lines.push(
    "Three numbers that look like one, and keeping them apart is the whole point.",
    "",
    "| | What it is | Value |",
    "| --- | --- | --- |",
    `| **client default** | what the plugin ships configured to do | ${UE_V1_CLIENT_DEFAULTS.defaultBatchEvents} events, every ${UE_V1_CLIENT_DEFAULTS.flushIntervalSeconds}s |`,
    `| **client range** | what an operator may configure, without a code change | ${UE_BATCH_RANGE.min}–${UE_BATCH_RANGE.max} events |`,
    `| **backend ceiling** | the absolute point of refusal — **PROPOSED** | ${PROPOSED_BACKEND_CEILINGS.maxBatchEvents} events, ${(PROPOSED_BACKEND_CEILINGS.maxBatchBytes / 1_048_576).toFixed(0)} MiB |`,
    "",
    "Collapsing any two of those produces a `413` on a legitimate setting, or a ceiling that",
    "cannot be enforced. The backend ceiling sits **at or above** the top of the client range,",
    "and it is still a proposal.",
    "",
    "## Confirmed V1 client settings",
    "",
    "| Setting | Value |",
    "| --- | --- |",
    `| \`default_batch_events\` | ${UE_V1_CLIENT_DEFAULTS.defaultBatchEvents} |`,
    `| \`flush_interval_seconds\` | ${UE_V1_CLIENT_DEFAULTS.flushIntervalSeconds} |`,
    `| \`max_event_bytes\` | ${UE_V1_CLIENT_DEFAULTS.maxEventBytes} (64 KiB) |`,
    `| \`max_local_outbox_bytes\` | ${UE_V1_CLIENT_DEFAULTS.maxLocalOutboxBytes} (50 MB) |`,
    `| outbox directory | \`${UE_OUTBOX_DIRECTORY}\` |`,
    "",
    "## Capacity",
    "",
    `> ${OUTBOX_CAPACITY_STATEMENT}`,
    "",
    "| At | 50 MB holds |",
    "| --- | --- |",
    `| typical event sizes | about ${expectedEventCapacity().toLocaleString("en-GB")} events |`,
    `| the 64 KiB cap | **${worstCaseEventCapacity()}** events |`,
    "",
    "Two orders of magnitude apart, which is why the ceiling is enforced by bytes actually used.",
    "A queue enforcing a fixed event count would overrun its disk budget by roughly sixty times",
    "whenever events ran large — exactly when a showroom is producing the most.",
    "",
    "## Configurable without a code change",
    "",
    "Operational configuration must not require editing plugin C++. Defaults may live in code;",
    "the deployment is authoritative within server-approved bounds, and **a stricter server value",
    "always wins**.",
    "",
  );
  for (const setting of UE_CONFIGURABLE_SETTINGS) lines.push(`- ${setting}`);

  lines.push(
    "",
    "## Consent",
    "",
    `\`Consent Given\` is ${CONSENT_SETTING_MEANING}`,
    "",
    "There is no consent field anywhere on the wire, and no value of it relaxes the privacy",
    "guard. An event carrying a raw email address is rejected whether or not somebody ticked a",
    "box in Project Settings.",
    "",
  );
  return lines.join("\n");
}

const BANNER = (what: string) =>
  [
    `<!-- GENERATED by \`pnpm contracts:ue5\`. Do not edit by hand. -->`,
    "",
    `# ${what}`,
    "",
    `**Contract:** \`${UE5_CONTRACT_VERSION}\` · **Status:** ${UE5_CONTRACT_STATUS}`,
    "",
    "Generated from `packages/contracts/src/ue5/`. A drift test fails if this file and the",
    "source disagree, so what follows is what the code actually enforces rather than what a",
    "document once said it would.",
    "",
  ].join("\n");

function traceabilityMarkdown(): string {
  const counts = classificationCounts();
  const lines: string[] = [BANNER("UE5 contract traceability")];

  lines.push("## Counts", "");
  lines.push("| Classification | Rules |", "| --- | --- |");
  for (const classification of CLASSIFICATIONS) {
    lines.push(`| \`${classification}\` | ${counts[classification]} |`);
  }
  lines.push("", `**Total:** ${CONTRACT_RULES.length}`, "");

  lines.push(
    "Every `LOCKED_FROM_BRIEF` row cites the section of the architecture brief it comes from.",
    "Every `DERIVED_FROM_LOCKED_RULE` row names the locked rules it follows from. Nothing",
    "`PROPOSED` may cite the brief — a proposal borrowing that authority is exactly what this",
    "table exists to prevent.",
    "",
  );

  for (const classification of CLASSIFICATIONS) {
    const rules = CONTRACT_RULES.filter((rule) => rule.classification === classification);
    if (rules.length === 0) continue;
    lines.push(`## ${classification}`, "");
    lines.push(
      "| Id | Rule | Authority | Owner | Blocks | Where |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const rule of rules) {
      const authority =
        rule.briefSection ??
        (rule.derivedFrom.length > 0 ? rule.derivedFrom.map((id) => `\`${id}\``).join(", ") : "—");
      const blocks = rule.blocks.length > 0 ? rule.blocks.join(", ") : "—";
      lines.push(
        `| \`${rule.id}\` | ${escapePipes(rule.statement)} | ${authority} | ${rule.owner} | ${blocks} | \`${rule.where}\` |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}`;
}

function errorModelMarkdown(): string {
  const lines: string[] = [BANNER("UE5 contract error model")];

  lines.push(
    "## The rule the rest of this depends on",
    "",
    "> **The HTTP status says whether the batch was processed. It never says whether the",
    "> events were accepted.**",
    "",
    "`200` means the batch was processed — read the per-event results, even when every event",
    "in it was rejected. Any non-2xx means nothing was stored and the whole batch is safe to",
    "resend unchanged.",
    "",
    "## Request level",
    "",
    "| Code | HTTP | Meaning | Retryable | Outbox | Sending | Operator |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const failure of REQUEST_FAILURES) {
    lines.push(
      `| \`${failure.code}\` | ${failure.httpStatus} | ${escapePipes(failure.meaning)} | ${yesNo(failure.retryable)} | \`${failure.outbox}\` | \`${failure.sending}\` | ${yesNo(failure.operatorRequired)} |`,
    );
  }

  lines.push(
    "",
    "## Event level",
    "",
    "| Code | Meaning | Retryable | Outbox | Sending | Operator |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const rejection of EVENT_REJECTIONS) {
    lines.push(
      `| \`${rejection.code}\` | ${escapePipes(rejection.meaning)} | ${yesNo(rejection.retryable)} | \`${rejection.outbox}\` | \`${rejection.sending}\` | ${yesNo(rejection.operatorRequired)} |`,
    );
  }

  lines.push(
    "",
    "## Codes this build has never heard of",
    "",
    "| Situation | Retryable | Outbox | Sending |",
    "| --- | --- | --- | --- |",
    "| Unrecognised **event** rejection code | no | `quarantine` | `continue` |",
    "| Unrecognised **4xx** | no | `quarantine` | `continue` |",
    "| Unrecognised other status | yes | `retain` | `backoff` |",
    "| No response at all (timeout, reset, lost acknowledgement) | yes | `retain` | `backoff` |",
    "",
    "An unrecognised event code is treated as non-retryable **whatever the server said about**",
    "**`retryable`**. A client that retries something it cannot interpret retries for ever, and",
    "a quarantined event an operator can see is a better failure than an infinite loop nobody",
    "notices.",
    "",
    "## Rationale, per code",
    "",
  );
  for (const failure of REQUEST_FAILURES) {
    lines.push(`**\`${failure.code}\`** — ${failure.rationale}`, "");
  }
  for (const rejection of EVENT_REJECTIONS) {
    lines.push(`**\`${rejection.code}\`** — ${rejection.rationale}`, "");
  }
  return lines.join("\n");
}

function validationOrderMarkdown(): string {
  const lines: string[] = [BANNER("Local validation order — UE-OBS-005")];

  lines.push(
    "Three stages, and the split decides what the plugin can actually do.",
    "",
    "| Stage | Runs where | Why |",
    "| --- | --- | --- |",
    "| `structural` | **locally** | Shape, size and consistency need no server knowledge. |",
    "| `privacy` | **locally** | The whole point of doing it locally is that a rejected value never leaves the machine. |",
    "| `semantic` | server only | A plugin holds neither the event registry nor server time. Guessing would reject good events. |",
    "",
    "A plugin that runs the first two stages before an event enters the outbox turns a round",
    "trip into an assertion at the call site, and never queues an event that was always going",
    "to be quarantined.",
    "",
    "## The order",
    "",
    "| # | Stage | Step | Rejection | Local |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const step of LOCAL_VALIDATION_ORDER) {
    lines.push(
      `| ${step.order} | \`${step.stage}\` | ${escapePipes(step.name)} | \`${step.rejection}\` | ${step.local ? "yes" : "no"} |`,
    );
  }

  lines.push("", "## What each step checks", "");
  for (const step of LOCAL_VALIDATION_ORDER) {
    lines.push(`### ${step.order}. ${step.name} — \`${step.rejection}\``, "");
    for (const check of step.checks) lines.push(`- ${check}`);
    lines.push("", step.note, "");
  }

  lines.push(
    "## Two rules for the privacy stage",
    "",
    "**The validator must fail without logging the rejected value.** A diagnostic that quotes",
    "the leaked email into a rejection record, a log line and a support ticket has tripled the",
    "leak while appearing to prevent it. Name the key and the kind; never the value.",
    "",
    "**Heuristic detection is not the long-term policy.** It is a guardrail against accidents —",
    "a debug field left in a build, an exception message pasted into a payload. The stronger",
    "control is the per-event schema registry, which whitelists property keys by name and is a",
    "later milestone (ADR-0013).",
    "",
  );
  return lines.join("\n");
}

function outboxMarkdown(): string {
  const lines: string[] = [BANNER("Durable outbox state semantics — UE-OBS-006")];

  lines.push(
    "The internal representation is the plugin's business. A status column, two files, an index",
    "and a tombstone log — any of those is fine. What is contract is the **observable**",
    "**behaviour**: given a response, does the event still get delivered, is it retried, and can",
    "it be lost.",
    "",
    "> **Nothing is ever silently lost.** Every state either keeps trying or keeps the event on",
    "> disk with a reason attached. A queue ceiling that drops an event must count it and report",
    "> it.",
    "",
    "## States",
    "",
    "| State | Delivered again? | Meaning |",
    "| --- | --- | --- |",
    "| `pending` | yes | Waiting to be sent. Where retries return to. |",
    "| `in_flight` | yes | Sent, no answer yet. **Optional** — an implementation may fold this into `pending`. |",
    "| `retained` | yes | Kept after a retryable failure. |",
    "| `accepted` | no | The server stored it. Delivery finished. |",
    "| `duplicate` | no | The server already had it. Delivery finished — **this is a success**. |",
    "| `quarantined` | no | Kept on disk with a reason, never retried. Needs a human. |",
    "",
    "An event in flight when the process dies must come back as `pending`, never as delivered.",
    "A crash is not an acknowledgement.",
    "",
    "## The event remains locally when",
    "",
  );
  for (const line of EVENT_REMAINS_LOCALLY) lines.push(`- ${line}`);

  lines.push("", "## The event leaves pending delivery when", "");
  for (const line of EVENT_LEAVES_PENDING_DELIVERY) lines.push(`- ${line}`);

  lines.push(
    "",
    "Those two, and nothing else. A 503 is not an acknowledgement, a timeout is not an",
    "acknowledgement, and a connection dying mid-response is not an acknowledgement.",
    "",
    "## The event is preserved but not retried when",
    "",
  );
  for (const line of EVENT_PRESERVED_NOT_RETRIED) lines.push(`- ${line}`);

  lines.push("", "## Every situation, derived from the error model", "");
  lines.push("| Situation | State | Retried | Sending |", "| --- | --- | --- | --- |");

  const rows: Array<[string, ReturnType<typeof outboxStateForEventResult>]> = [
    ["per-event `accepted`", outboxStateForEventResult("accepted")],
    ["per-event `duplicate`", outboxStateForEventResult("duplicate")],
    ...EVENT_REJECTIONS.map(
      (rejection) =>
        [
          `per-event \`${rejection.code}\``,
          outboxStateForEventResult("rejected", rejection.code, rejection.retryable),
        ] as [string, ReturnType<typeof outboxStateForEventResult>],
    ),
    [
      "per-event code this build does not know",
      outboxStateForEventResult("rejected", "a_future_code"),
    ],
    ...REQUEST_FAILURES.map(
      (failure) =>
        [
          `whole request \`${failure.httpStatus} ${failure.code}\``,
          outboxStateForRequestFailure(failure.httpStatus),
        ] as [string, ReturnType<typeof outboxStateForEventResult>],
    ),
    ["whole request, unrecognised 5xx", outboxStateForRequestFailure(507)],
    ["no response at all", outboxStateForTransportFailure()],
  ];
  for (const [situation, state] of rows) {
    lines.push(
      `| ${situation} | \`${state.state}\` | ${state.retried ? "yes" : "no"} | \`${state.sending}\` |`,
    );
  }

  lines.push("", "## On restart", "");
  for (const line of RESTART_INVARIANTS) lines.push(`- ${line}`);

  lines.push(
    "",
    "## After 401 or 403 — PROPOSED",
    "",
    "Still a proposal: the operational and UX side has not been confirmed on the UE side. The",
    "second line is the one that is not negotiable — the events were never the problem.",
    "",
  );
  for (const line of UNAUTHORISED_OUTBOX_BEHAVIOUR) lines.push(`- ${line}`);
  lines.push("");
  return lines.join("\n");
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

/* ============================================================ the CLI body */

function write(): void {
  rmSync(OUT, { recursive: true, force: true });
  const files = generatedArtefacts();
  for (const [relative, contents] of files) {
    const target = join(OUT, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }
  console.log(`wrote ${files.size} files to docs/ue5-contract/`);
}

/** What is on disk now, for the drift test. */
export function committedArtefact(relative: string): string | null {
  try {
    return readFileSync(join(OUT, relative), "utf8");
  } catch {
    return null;
  }
}

const invokedDirectly = process.argv[1]?.endsWith("emit-ue5-contract.ts") ?? false;
if (invokedDirectly) write();
