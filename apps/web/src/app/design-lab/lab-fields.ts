import type { LabSource } from "./lab-data";
import {
  ageSeconds,
  ageSince,
  bytes,
  count,
  environmentWord,
  instant,
  lifecycleWord,
  percent,
  reported,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";

/**
 * EVERY FIGURE THE BRIEF NAMES, FORMATTED ONCE.
 *
 * The three variants must show exactly the same state, and the surest way to
 * fail that is to let each one call the formatters itself. One of them will
 * reach for `String(n)` somewhere and a reviewer will be comparing a layout
 * against a rounding difference.
 *
 * So the facts arrive here as `Reading` pairs, which is the shape the rest of
 * the surface already uses: `{ text, missing }`. `missing` is the part that
 * matters and the part a variant may not ignore. An absent value is a word
 * matched to the field and it is never a zero, so the composition has to have
 * somewhere to put "Not reported" that does not look like a measurement.
 */

export interface LabState {
  readonly key: "activation" | "connection" | "ingestion";
  /** The uppercase eyebrow: what is being reported on. */
  readonly column: string;
  /** The state, in words. Never only a colour and never only a mark. */
  readonly word: string;
  readonly holds: boolean;
  /** The one thing that proves it, and when. */
  readonly evidence: string;
  readonly at: Reading;
  /** What this state does NOT tell you, for the disclosure. */
  readonly proves: string;
}

export interface LabFigure {
  readonly label: string;
  readonly reading: Reading;
  readonly note: string;
}

export interface LabFields {
  readonly kicker: string;
  readonly title: string;
  readonly project: string;
  readonly environment: string;
  readonly lifecycle: string;
  readonly answer: string;
  readonly healthLabel: string;
  readonly states: readonly LabState[];
  /** App, plugin, build and engine, as the installation last reported them. */
  readonly build: readonly LabFigure[];
  /** The operational health block the brief enumerates. */
  readonly health: readonly LabFigure[];
  readonly fill: number | null;
  readonly fillReading: Reading;
  readonly queueUsed: Reading;
  readonly queueCeiling: Reading;
  readonly identifier: string;
  readonly created: Reading;
  readonly lastSeen: Reading;
  readonly lastSeenAge: string | null;
}

/**
 * The last error code, or the fact that there was none.
 *
 * `reported()` would call an empty column "Not reported", which is wrong here.
 * The column is written on every heartbeat: empty means the installation looked
 * and had nothing to report, and that is a measurement rather than a silence.
 */
function errorCode(value: string | null): Reading {
  const shown = (value ?? "").trim();
  return shown.length === 0
    ? { text: "None recorded", missing: false }
    : { text: shown, missing: false };
}

export function labFields(source: LabSource): LabFields {
  const { view, credential, now } = source;
  const { status, operations, states } = view;

  const heartbeatAt = instant(operations?.last_heartbeat_at ?? null);
  const verifiedAt = instant(operations?.ingestion_verified_at ?? null);
  const activatedAt = instant(credential?.created_at ?? null, "Never activated");

  return {
    kicker: sourceTypeWord(status.source_type),
    title: status.display_label,
    project: source.projectName ?? "Unknown project",
    environment: environmentWord(status.environment),
    lifecycle: lifecycleWord(status.state),
    answer: source.answer.sentence,
    healthLabel: source.healthLabel,

    /*
     * Three states, and the ORDER is the argument. Configured, then reachable,
     * then delivering: each answers a different question and none implies the
     * next. All four combinations occur, which is why the evidence travels with
     * the word rather than a stage number.
     */
    states: [
      {
        key: "activation",
        column: "Activation",
        word: states.activated ? "Activated" : "Not activated",
        holds: states.activated,
        evidence: states.activated ? source.credentialLabel : "No credential has ever been issued",
        at: activatedAt,
        proves: "A credential exists. It says nothing about whether the machine has ever run.",
      },
      {
        key: "connection",
        column: "Connection",
        word: states.connected
          ? view.heartbeatFresh
            ? "Connected"
            : "Offline"
          : "Awaiting first heartbeat",
        holds: states.connected && view.heartbeatFresh,
        evidence: states.connected
          ? "The installation is reporting its own health"
          : "Nothing has ever been heard from this machine",
        at: heartbeatAt,
        proves: "The machine can reach us. It says nothing about whether its events land.",
      },
      {
        key: "ingestion",
        column: "Ingestion",
        word: states.ingestionVerified ? "Verified" : "Not verified",
        holds: states.ingestionVerified,
        evidence: states.ingestionVerified
          ? "An event travelled the whole path into storage"
          : "No event has yet been proved to reach storage",
        at: verifiedAt,
        proves: "One event reached storage at least once. It is not a rate and not a guarantee.",
      },
    ],

    build: [
      {
        label: "App version",
        reading: reported(operations?.observed_app_version ?? null),
        note: "",
      },
      { label: "Plugin version", reading: reported(operations?.observed_plugin ?? null), note: "" },
      { label: "Build", reading: reported(operations?.observed_build_id ?? null), note: "" },
      { label: "Engine", reading: reported(operations?.observed_engine ?? null), note: "" },
    ],

    health: [
      {
        label: "Queue events",
        reading: count(operations?.queue_event_count ?? null),
        note: "Held in the installation's outbox, not yet accepted.",
      },
      {
        label: "Oldest pending",
        reading: ageSeconds(operations?.oldest_pending_age_seconds ?? null),
        note: "How long the oldest unsent event has waited.",
      },
      {
        label: "Quarantine",
        reading: count(operations?.quarantine_count ?? null),
        note: "Refused by the installation before it ever left.",
      },
      {
        label: "Backend quarantine",
        reading: count(operations?.backend_quarantine_count ?? null),
        note: "Accepted by transport, then refused by the backend.",
      },
      {
        label: "Validation failures",
        reading: count(operations?.validation_failure_count ?? null),
        note: "Events that did not match the wire contract.",
      },
      {
        label: "Capacity refusals",
        reading: count(operations?.capacity_refusal_count ?? null),
        note: "Events dropped because the outbox was full.",
      },
      {
        label: "Last error code",
        /*
         * "None recorded" rather than "Not reported", and the difference is
         * real: the column is written on every heartbeat, so an empty one means
         * the installation reported no error, not that it said nothing.
         */
        reading: errorCode(operations?.last_error_code ?? null),
        note: "A code, never a message. Nothing from a payload reaches this screen.",
      },
    ],

    fill: view.queueFillPercent,
    fillReading: percent(view.queueFillPercent),
    queueUsed: bytes(operations?.queue_bytes_used ?? null),
    queueCeiling: bytes(operations?.queue_bytes_ceiling ?? null),

    identifier: status.source_id,
    created: instant(status.created_at),
    lastSeen: instant(status.last_seen_at),
    lastSeenAge: ageSince(status.last_seen_at, now),
  };
}
