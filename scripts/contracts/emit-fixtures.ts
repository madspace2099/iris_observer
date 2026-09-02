import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFORMANCE_FIXTURES,
  DECLARED_SYNTHETIC_SECRETS,
  FIXTURE_OUTBOX_ACTIONS,
  UE5_FIXTURE_DIRECTORY,
  type ConformanceFixture,
} from "../../packages/contracts/src/ue5/fixtures";
import { UE5_CONTRACT_STATUS, UE5_CONTRACT_VERSION } from "../../packages/contracts/src/ue5/wire";

/**
 * GENERATES THE UE5 CONFORMANCE FIXTURE PACK.
 *
 *   pnpm contracts:fixtures
 *
 * The sibling of `emit-ue5-contract.ts`, with the same discipline and a
 * different job. That generator publishes the *shape* of the protocol — an
 * OpenAPI document and a JSON Schema per component. This one publishes the
 * *behaviour*: every exchange a conforming plugin must handle, each with the
 * per-event outbox decision the response must produce **and** the backend state
 * the exchange must leave behind.
 *
 * The distinction is the reason both exist. A schema can say that a `200`
 * carries a `results` array. It cannot say that a submitted event absent from
 * that array is still unacknowledged, that a result for an id nobody sent
 * acknowledges nothing, or that two results for one id must fail safe. Those are
 * the rules an implementation gets wrong, and they are only expressible as
 * worked examples.
 *
 * Nor can a schema say what the *server* must be holding afterwards, which is
 * why every fixture carries `expectedBackendState`. A pack that described only
 * the client half would pass a backend that had silently stopped writing
 * `ingestion_verified_at`.
 *
 * Everything is written from `packages/contracts/src/ue5/fixtures.ts` and
 * nothing by hand. `fixtures.test.ts` regenerates the pack in memory and fails
 * if the committed files differ, so an edit to a fixture that is not accompanied
 * by a regeneration cannot reach a commit.
 *
 * Deterministic by construction: no clock, no randomness, no environment, no
 * network. It reads TypeScript and writes files.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const OUT = join(ROOT, "docs", "ue5-contract", UE5_FIXTURE_DIRECTORY);

/**
 * What the three outbox actions mean, published inside the pack.
 *
 * A conformance runner in another language reads `index.json` and nothing else.
 * A vocabulary defined only in this repository's TypeScript would be a
 * vocabulary Akhilesh has to guess at.
 */
const ACTION_MEANINGS: Readonly<Record<string, string>> = Object.freeze({
  remove:
    "Acknowledged. The server holds the fact and the outbox row may be erased. Reached by a " +
    "per-event `accepted` and by a per-event `duplicate`, and by nothing else.",
  retain: "Not acknowledged. The event stays queued and will be offered to the transport again.",
  quarantine:
    "Kept on disk with its reason and never retried. Counted in the heartbeat so an operator " +
    "can see it. Never deleted.",
});

/**
 * What the backend-state vocabulary means, published for the same reason.
 *
 * A conformance runner that only reads `index.json` has to be able to tell
 * `unchanged` from `set` and, more importantly, `storedEventIds` from
 * `undeterminedEventIds` — the second is the pack saying it does not know, and a
 * runner that read it as "not stored" would assert something the contract never
 * claimed.
 */
const BACKEND_STATE_MEANINGS: Readonly<Record<string, string>> = Object.freeze({
  precondition: "What must already be true for the response in this fixture to be the correct one.",
  storedEventIds:
    "Every event_id `observer.analytics_events` certainly holds for this source afterwards, " +
    "including rows the precondition put there. Idempotency is the (source_id, event_id) primary " +
    "key, so this list is also the row count.",
  undeterminedEventIds:
    "Ids whose storage the response does not settle either way. Non-empty only where the response " +
    "is itself a backend defect, and it is the reason those events are retained rather than " +
    "removed: an outcome nobody can read cannot acknowledge anything.",
  connected:
    "`set` when the exchange writes `source_operations.last_heartbeat_at`, `unchanged` when it " +
    "must not — including when the column already holds a value.",
  ingestionVerified:
    "`set` when the exchange writes `source_operations.ingestion_verified_at`, `unchanged` when it " +
    "must not. A heartbeat never sets it and ingestion never sets `connected`.",
  activeCredentials: "Rows in `observer.source_credentials` for this source in state `active`.",
  activationCode:
    "`consumed` when this exchange spends the one-time code, `unchanged` when a presented code is " +
    "left exactly as it was found, `not-presented` when the request carried none.",
  assertion: "One line. What a backend conformance run asserts, in words.",
});

/** Everything the generator produces, as text, keyed by path under `OUT`. */
export function generatedFixtureFiles(): Map<string, string> {
  const files = new Map<string, string>();

  files.set("index.json", `${JSON.stringify(packIndex(), null, 2)}\n`);
  for (const fixture of CONFORMANCE_FIXTURES) {
    files.set(`${fixture.name}.json`, `${JSON.stringify(oneFixtureDocument(fixture), null, 2)}\n`);
  }
  files.set("README.md", readme());
  return files;
}

/** The stanza every document repeats, so a single file is self-describing. */
function contractStanza(): Record<string, unknown> {
  return {
    version: UE5_CONTRACT_VERSION,
    status: UE5_CONTRACT_STATUS,
    generatedBy: "pnpm contracts:fixtures",
    note: "Generated from packages/contracts/src/ue5/fixtures.ts. Do not edit by hand.",
  };
}

function packIndex(): Record<string, unknown> {
  return {
    contract: contractStanza(),
    outboxActions: Object.fromEntries(
      FIXTURE_OUTBOX_ACTIONS.map((action) => [action, ACTION_MEANINGS[action] ?? ""]),
    ),
    backendState: BACKEND_STATE_MEANINGS,
    /*
     * Published so a conformance runner can assert the same thing this
     * repository asserts: that no credential-shaped value in the pack is
     * anything but one of these.
     */
    syntheticSecrets: DECLARED_SYNTHETIC_SECRETS,
    fixtureCount: CONFORMANCE_FIXTURES.length,
    fixtures: CONFORMANCE_FIXTURES,
  };
}

function oneFixtureDocument(fixture: ConformanceFixture): Record<string, unknown> {
  return { contract: contractStanza(), fixture };
}

/* ============================================================ the README */

function readme(): string {
  const lines: string[] = [
    "<!-- GENERATED by `pnpm contracts:fixtures`. Do not edit by hand. -->",
    "",
    "# UE5 conformance fixture pack",
    "",
    `**Contract:** \`${UE5_CONTRACT_VERSION}\` · **Status:** ${UE5_CONTRACT_STATUS} · **Fixtures:** ${CONFORMANCE_FIXTURES.length}`,
    "",
    "Every exchange a conforming plugin must handle, as data — with what the client does next and",
    "what the backend must hold afterwards. `index.json` holds the whole pack; each fixture is also",
    "a standalone file named after it. Nothing here requires reading the backend source, and a",
    "drift test fails if these files and that source disagree.",
    "",
    'Most fixtures are an exchange (`"kind": "exchange"`). One publishes a rule about stored rows',
    'instead (`"kind": "read-model"`); see below.',
    "",
    "## How to run it",
    "",
    "For each fixture: build the request exactly as `request` states, feed `response` to the",
    "transport as if it came off the wire, and compare what the outbox did against",
    "`expectedOutboxActions` — **keyed by `event_id`, never by array position**. Then compare the",
    "sending loop's next state against `expectedSending`.",
    "",
    "Every response body validates against the published schema in `../schemas/`, with exactly",
    'one deliberate exception, marked `"responseValidates": false`. Two heartbeat fixtures exist',
    "to show what the endpoint refuses and carry a request that deliberately fails validation,",
    'marked `"requestValidates": false`.',
    "",
    "## The other half: `expectedBackendState`",
    "",
    "`expectedOutboxActions` says what the **client** does. `expectedBackendState` says what the",
    "**server** must be holding when the exchange is over: which rows exist for this source, which",
    "operational facts moved, what became of the credential and the activation code.",
    "",
    "A pack describing only the client half lets a backend regression through unnoticed. A server",
    "that stops writing `ingestion_verified_at`, or that advances `last_heartbeat_at` for a",
    "credential it has just refused, answers every fixture here correctly on the wire — and both",
    "are defects an operator discovers by trusting a screen that is wrong.",
    "",
    "Read `storedEventIds` and `undeterminedEventIds` as different claims. The first is what the",
    "backend **certainly** holds; the second is what the response does not reveal, and it is",
    "non-empty only where the response is itself a server defect. That is what makes `retain` the",
    "derived answer in those cases rather than a rule to memorise.",
    "",
    "| Field | Meaning |",
    "| --- | --- |",
  ];
  for (const [field, meaning] of Object.entries(BACKEND_STATE_MEANINGS)) {
    lines.push(`| \`${field}\` | ${escapePipes(meaning)} |`);
  }

  lines.push(
    "",
    "## Three states, kept apart",
    "",
    "**ACTIVATED** is a credential being issued. **CONNECTED** is a heartbeat succeeding.",
    "**INGESTION VERIFIED** is an event reaching storage through ordinary ingestion. No one of them",
    "implies another, and the pack has a fixture for each: `activation-success`,",
    "`heartbeat-success`, and `diagnostic-test-accepted`. Each records the two facts it does **not**",
    "set, because that is the half a single collapsed status destroys — a source can be INGESTION",
    "VERIFIED and never CONNECTED, and it is the one worth a phone call.",
    "",
    "## The three outbox actions",
    "",
    "| Action | Meaning |",
    "| --- | --- |",
  );
  for (const action of FIXTURE_OUTBOX_ACTIONS) {
    lines.push(`| \`${action}\` | ${ACTION_MEANINGS[action] ?? ""} |`);
  }

  lines.push(
    "",
    "There is deliberately no fourth action, and in particular no `discard`. No response",
    "anywhere in this pack may result in an event ceasing to exist.",
    "",
    "## The four that carry the most weight",
    "",
    "The rest of the pack confirms behaviour a careful implementation already has. These four are",
    "the ones that are wrong in practice, and each is wrong in a way that is silent:",
    "",
    "| Fixture | The rule |",
    "| --- | --- |",
    "| `ingest-missing-result` | A submitted event with no result of its own is **retained**. Silence is not acceptance. |",
    "| `ingest-foreign-result-id` | A result whose `event_id` was not submitted acknowledges **nothing**, and must never be matched to another queued event. |",
    "| `ingest-conflicting-duplicate-result` | Two results for one `event_id` **retain**. Fail safe. |",
    "| `ingest-malformed-2xx-body` | A `2xx` whose body does not validate acknowledges **zero** events. |",
    "",
    "All four have the same shape: the response looks plausible, the counters agree with",
    "themselves, and an implementation that pairs results to queued events by array position or",
    "by count acknowledges the wrong events without ever raising an error.",
    "",
    "## One anti-pattern, because it is live",
    "",
    "`ingest-accepted-is-a-count-not-a-list` carries a valid canonical body **and** a",
    "`counterExample` that a parser migrating from an `accepted_ids` field expects. `accepted` is",
    "an integer count. It is not a list of ids, and no field in `BatchResponse` lists accepted",
    "ids — acknowledgement comes only from `results[].event_id`.",
    "",
    "A parser that binds `accepted_ids` to `accepted` reads a number where it expects an array,",
    "and in every language that coerces, the failure is quiet: the outbox acknowledges nothing",
    "while the server stores everything.",
    "",
    "## One pair, because the rule is easy to half-implement",
    "",
    "`ingest-unknown-rejection-code-retryable-true` and",
    "`ingest-unknown-rejection-code-retryable-false` are the same batch, the same event and the",
    "same unrecognised code. The two responses differ in that one flag and **the correct client",
    "behaviour is identical**: quarantine, both times.",
    "",
    "An unrecognised code is never interpreted, so nothing the server said alongside it can be",
    "trusted either. A client that branches on `retryable` passes one of these fixtures and fails",
    "the other, and what it does in the field is retry a code nobody can read, for ever.",
    "",
    "## One fixture that is not an HTTP exchange",
    "",
    '`diagnostic-excluded-from-business-metrics` has `"kind": "read-model"` instead of a request',
    "and a response. It carries `storedRows` and `expectedReadModel`, because the rule it publishes",
    "— a diagnostic row is stored for ever and counted never — is a property of every read model in",
    "the product and there is no HTTP call that demonstrates it.",
    "",
    "The exclusion is a published predicate rather than a habit: `event_name NOT LIKE",
    "'diagnostic.%'`, matching the whole reserved `diagnostic.` namespace and not one name, so a",
    "diagnostic invented next year is excluded on the day it exists. The fixture records what the",
    "metric reports with the rule (`value`) and without it (`valueWithoutTheRule`), which is the",
    "difference between a correct number and a quietly inflated one.",
    "",
    "Faking it as an exchange would have meant inventing a query endpoint — publishing an interface",
    "that does not exist, inside the one document whose value is that its contents can be relied on.",
    "",
    "## Credentials",
    "",
    "Every secret-shaped value in this pack is synthetic and fixed:",
    "",
  );
  for (const secret of DECLARED_SYNTHETIC_SECRETS) lines.push(`- \`${secret}\``);

  lines.push(
    "",
    "Neither is a well-formed credential — a real source token is `obs.<selector>.<secret>` — so",
    "nothing here can be pasted into a client and appear to work. A test sweeps the generated",
    "pack and fails if any other credential-shaped value appears in it.",
    "",
    "## The fixtures",
    "",
    "| Fixture | Status | Why |",
    "| --- | --- | --- |",
  );
  for (const fixture of CONFORMANCE_FIXTURES) {
    lines.push(
      `| [\`${fixture.name}\`](./${fixture.name}.json) | ${statusColumn(fixture)} | ${escapePipes(fixture.why)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * What goes in the status column for a fixture that has no HTTP status.
 *
 * Spelled `read model` rather than left blank or filled with a dash. A blank
 * cell reads as an omission, and the one fixture in this pack without a status
 * is the one whose whole point is that it is not an exchange.
 */
function statusColumn(fixture: ConformanceFixture): string {
  return fixture.kind === "exchange" ? String(fixture.response.status) : "read model";
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/* ============================================================ the CLI body */

function write(): void {
  /*
   * Only this subtree is cleared, and it is cleared whole. `emit-ue5-contract.ts`
   * owns everything else under `docs/ue5-contract/` and leaves `fixtures/` alone;
   * the two generators must not be able to delete each other's output.
   */
  rmSync(OUT, { recursive: true, force: true });
  const files = generatedFixtureFiles();
  for (const [relative, contents] of files) {
    const target = join(OUT, relative);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }
  console.log(`wrote ${files.size} files to docs/ue5-contract/${UE5_FIXTURE_DIRECTORY}/`);
}

/** Every path currently on disk under the pack directory, for the drift test. */
export function committedFixtureFiles(): readonly string[] {
  if (!existsSync(OUT)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(OUT, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const parent = entry.parentPath.slice(OUT.length + 1).replace(/\\/g, "/");
    found.push(parent === "" ? entry.name : `${parent}/${entry.name}`);
  }
  return found.sort();
}

/** Where the pack lives, so a test does not have to rebuild the path. */
export const FIXTURE_PACK_DIRECTORY = OUT;

const invokedDirectly = process.argv[1]?.endsWith("emit-fixtures.ts") ?? false;
if (invokedDirectly) write();
