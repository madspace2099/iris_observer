import type { SourceView } from "@/lib/sources/control-plane";

/**
 * How the operations screens render a measurement.
 *
 * The whole file exists to keep one rule enforceable in one place: **an absent
 * value is never a zero**. A queue that could not be measured, a heartbeat that
 * has never arrived and a quarantine that is genuinely empty are three
 * different facts, and a formatter that returns "0" for all three destroys the
 * distinction before the markup gets a chance to.
 *
 * So every formatter here returns the pair `{ text, missing }` rather than a
 * string, and the markup sets `data-missing` from it. A caller cannot render an
 * absent value as a present one without deliberately ignoring half the return.
 *
 * The second rule is the design system's: an absent value is a **word matched
 * to the field, never a dash**. Not reported, Never, Never verified, Not set.
 * Every string this module can return is such a word, which is why no caller
 * has to invent one.
 */

export interface Reading {
  readonly text: string;
  readonly missing: boolean;
}

/** What an unmeasured number says. A heartbeat's payload is optional by design. */
export const NOT_REPORTED = "Not reported";

const present = (text: string): Reading => ({ text, missing: false });
const absent = (text: string = NOT_REPORTED): Reading => ({ text, missing: true });

/* --- the formatters, declared once ---------------------------------------------- */

/**
 * One formatter per shape, at module scope.
 *
 * The accessibility contract puts every number and every date through `Intl`,
 * and a formatter constructed inside a function is constructed again for every
 * cell of a table. The locale is pinned rather than inherited because these
 * pages are server-rendered: an unpinned formatter prints whatever locale the
 * host happens to run under, which on Vercel is not the operator's and on a
 * development machine is not the same as on Vercel.
 */
const FIGURE = new Intl.NumberFormat("en-GB");
const FIGURE_WHOLE = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const FIGURE_TENTH = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const PERCENTAGE = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 0,
});

/**
 * The instant formatter: `Intl`, with both the locale and the zone pinned.
 *
 * `hourCycle: "h23"` rather than the locale's default, so an hour is always two
 * digits and the column of timestamps stays aligned on tabular figures.
 */
const UTC_INSTANT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* --- instants ------------------------------------------------------------------ */

/** A stored timestamp that no clock can read. Not the same fact as an empty column. */
const UNREADABLE = "Not readable";

/**
 * An instant, in UTC.
 *
 * The facades emit `YYYY-MM-DDTHH:MM:SSZ` and these pages are server-rendered,
 * so a locale-aware formatter left to its own devices would print whatever the
 * host's locale happens to be — which on Vercel is not the operator's, and on a
 * development machine is not the same as on Vercel. `Intl` does the formatting
 * the accessibility contract requires, and the parts are put back in ISO order
 * so the rendering is the same everywhere and still matches the timestamps in
 * the database an operator will compare it against.
 */
export function instant(value: string | null, whenAbsent = "Never"): Reading {
  if (value === null) return absent(whenAbsent);
  const parsed = Date.parse(value);
  /*
   * A column holding something unparseable is NOT the same fact as an empty
   * one: the first is a row this screen cannot read, the second is a source
   * that never did the thing. Reporting the first as the second would tell an
   * operator no heartbeat ever arrived when one did.
   */
  if (!Number.isFinite(parsed)) return absent(UNREADABLE);

  const parts: Record<string, string> = {};
  for (const part of UTC_INSTANT.formatToParts(new Date(parsed))) parts[part.type] = part.value;
  const field = (type: string): string => parts[type] ?? "";

  return present(
    `${field("year")}-${field("month")}-${field("day")} ${field("hour")}:${field("minute")} UTC`,
  );
}

/** How long ago, in words. Null when there is no instant to measure from. */
export function ageSince(value: string | null, now: Date): string | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const seconds = Math.max(0, Math.round((now.getTime() - parsed) / 1000));
  return `${duration(seconds)} ago`;
}

/**
 * A span, in the largest two units that carry information.
 *
 * Not "1847 seconds". An operator reading an oldest-pending age is deciding
 * whether to worry, and "30 min" answers that where a four-digit second count
 * has to be divided first.
 *
 * The units are abbreviations rather than words, so there is no plural to
 * select: "1 min" and "15 min" are both correct. The moment one of them is
 * ever spelled out, the form has to come from `Intl.PluralRules` and not from
 * a ternary on the number.
 */
export function duration(seconds: number): string {
  if (seconds < 60) return `${FIGURE.format(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${FIGURE.format(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0
      ? `${FIGURE.format(hours)} h`
      : `${FIGURE.format(hours)} h ${FIGURE.format(rest)} min`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0
    ? `${FIGURE.format(days)} d`
    : `${FIGURE.format(days)} d ${FIGURE.format(restHours)} h`;
}

/** An age measured in seconds by the plugin, or the fact that it was not measured. */
export function ageSeconds(value: number | null): Reading {
  return value === null ? absent() : present(duration(value));
}

/* --- quantities ----------------------------------------------------------------- */

/** A count. Zero is a real count and is rendered as one; null is not. */
export function count(value: number | null, unit?: string): Reading {
  if (value === null) return absent();
  const figure = FIGURE.format(value);
  return present(unit === undefined ? figure : `${figure} ${unit}`);
}

/**
 * A byte measurement, base 1000 and labelled as such.
 *
 * Base 1000 rather than 1024 because the ceiling is a number an operator
 * configures in the plugin, and a configured 50 MB that renders as "47.7 MB" is
 * a support question every single time.
 */
export function bytes(value: number | null): Reading {
  if (value === null) return absent();
  if (value < 1000) return present(`${FIGURE.format(value)} B`);
  const units = ["kB", "MB", "GB", "TB"] as const;
  let scaled = value / 1000;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const label = units[unit] ?? "kB";
  /*
   * One decimal below ten, none above, and grouping either way: a queue of
   * 1024 kB reads "1,024 kB", because an ungrouped four-figure value breaks
   * the tabular alignment the data panels are read down.
   */
  return present(`${(scaled < 10 ? FIGURE_TENTH : FIGURE_WHOLE).format(scaled)} ${label}`);
}

/** A percentage that was actually computable. `queueFill` already returns null otherwise. */
export function percent(value: number | null): Reading {
  return value === null ? absent() : present(PERCENTAGE.format(value / 100));
}

/** Free text a heartbeat reported, or the fact that it reported none. */
export function reported(value: string | null): Reading {
  return value === null || value.trim().length === 0 ? absent() : present(value);
}

/* --- vocabulary ------------------------------------------------------------------ */

/**
 * A token none of the vocabularies below recognises, said in words.
 *
 * Never the bare column value. A screen printing `showroom_ue5` or `suspended`
 * as if it were English is a screen showing the reader the database, and the
 * one case where it happens is the case where something is already wrong and
 * the reader most needs to be told which value the row actually holds.
 */
function unrecognised(noun: string, token: string): string {
  const shown = token.trim();
  return shown.length === 0 ? "Not set" : `Unrecognised ${noun} (${shown})`;
}

/** Lifecycle, as a word. The column holds the truth; this only capitalises it. */
export function lifecycleWord(state: string): string {
  if (state === "active") return "Active";
  if (state === "suspended") return "Suspended";
  if (state === "archived") return "Archived";
  return unrecognised("state", state);
}

/** Source type, as a phrase an operator would say out loud. */
export function sourceTypeWord(type: string): string {
  if (type === "showroom_ue5") return "IRIS showroom (UE5)";
  if (type === "web_iris") return "WEBIRIS";
  if (type === "crm") return "CRM";
  if (type === "communication") return "Communication";
  if (type === "manual_admin") return "Manual (admin)";
  return unrecognised("type", type);
}

/** Environment, capitalised. Authoritative — never what a client reported. */
export function environmentWord(environment: string): string {
  const named = environment.trim();
  if (named.length === 0) return "Not set";
  return named.slice(0, 1).toUpperCase() + named.slice(1);
}

/** Credential lifecycle, as a word plus the tone that agrees with it. */
export function credentialWord(state: string): {
  word: string;
  tone: "good" | "watch" | "unknown";
} {
  if (state === "active") return { word: "Active", tone: "good" };
  if (state === "revoked") return { word: "Revoked", tone: "watch" };
  if (state === "superseded") return { word: "Superseded", tone: "unknown" };
  if (state === "expired") return { word: "Expired", tone: "watch" };
  return { word: unrecognised("credential state", state), tone: "unknown" };
}

/* --- the two-second answer --------------------------------------------------------- */

/** What the disclosure beside the answer explains, and what it says. */
export interface AnswerNote {
  /** The thing explained, as a phrase. The control announces it as "About …". */
  readonly label: string;
  /** The explanation itself. */
  readonly text: string;
}

export interface InstallationAnswer {
  /** One sentence, composed from persisted state and nothing else. */
  readonly sentence: string;
  readonly tone: "good" | "watch" | "weak" | "unknown";
  /**
   * The doctrine behind the sentence, for the `InfoNote` beside it. Null when a
   * branch has nothing to explain.
   *
   * It travels beside the sentence rather than inside it because the sentence
   * has to be the answer and nothing else. Definitions, the reason a threshold
   * sits where it does and the difference between two states that look alike
   * belong behind the disclosure; the state, the party waited on, the date, a
   * refusal's reason and anything a reader must act on never do, and none of
   * those is in here.
   */
  readonly note: AnswerNote | null;
}

/**
 * "Is this installation configured, connected and delivering valid analytics?"
 *
 * Composed deterministically from the three states, the freshness of the
 * heartbeat and the lifecycle — the same inputs the three columns below it
 * render, so the sentence and the columns cannot disagree. It is emphatically
 * NOT a fourth state: there is no value here a screen could set, no percentage
 * across the three, and no ordering that would make one of them a stage of
 * another.
 *
 * The branch order is `classifyHealth`'s order, and that is load-bearing rather
 * than tidy: the badge beside this sentence is that function's word. While the
 * two orders differed, a connected but unverified source holding one
 * quarantined event rendered the badge "Needs attention" against the sentence
 * "Connected, and no analytics verified." in the same header. Ingestion
 * verified is therefore tested here after quarantine and after queue pressure,
 * exactly as it is there. Neither order may be changed without the other.
 *
 * Because those two branches are now reachable while ingestion is unverified,
 * neither of them claims verification: they say Connected, which is true in
 * both cases, and the Ingestion verified column below says the rest.
 *
 * Each clause names the state, then the party waited on, then the date where
 * one is persisted. The explanatory half of every branch is in `note`.
 */
export function installationAnswer(view: SourceView, now: Date): InstallationAnswer {
  const { states, operations, heartbeatFresh, status } = view;

  if (status.state === "archived") {
    return {
      sentence: "Archived. Nothing further is waited on.",
      tone: "unknown",
      note: {
        label: "the Archived state",
        text: "This source is terminal. Nothing further is expected from the installation, and its state is kept for the record rather than for operation.",
      },
    };
  }

  if (status.state === "suspended") {
    return {
      sentence: "Suspended. What it sends is refused until an operator resumes it.",
      tone: "watch",
      note: {
        label: "the Suspended state",
        text: "The installation is switched off deliberately.",
      },
    };
  }

  if (!states.activated) {
    return {
      sentence:
        "Not activated. Waiting on the client's installer. Issue an activation code and enter it in the plugin.",
      tone: "unknown",
      note: {
        label: "the Activated state",
        text: "No credential exchange has ever completed for this source, so the installation cannot send anything yet.",
      },
    };
  }

  if (!states.connected) {
    /*
     * `created_at` rather than an activation date: the credential row is not an
     * input to this function, so registration is the only persisted date this
     * branch can state without inferring one.
     */
    const registered = instant(status.created_at);
    const since = registered.missing ? "" : ` since it was registered on ${registered.text}`;
    return {
      sentence: `Activated, and never connected. Waiting on the installation for its first heartbeat${since}.`,
      tone: "watch",
      note: {
        label: "the Activated and Connected states",
        text: "A credential exists, and no heartbeat has ever been accepted.",
      },
    };
  }

  if (!heartbeatFresh) {
    const age = ageSince(operations?.last_heartbeat_at ?? null, now);
    /*
     * The old fallback said the heartbeat "arrived some time ago", inside a
     * sentence asserting that it arrived. An unparseable timestamp is a row
     * this screen cannot read, and saying so is the honest half of the pair.
     */
    const heard =
      age === null
        ? "The time of its last heartbeat cannot be read."
        : `Its last heartbeat arrived ${age}.`;
    return {
      sentence: `Offline. Waiting on the installation for its next heartbeat. ${heard}`,
      tone: "watch",
      /*
       * The window is described, not counted. `HEARTBEAT_FRESH_MS` lives in a
       * `server-only` module and this file is imported by client components, so
       * the figure is rendered by the screen from the constant instead of being
       * spelled out here, where it would go stale the day the constant moves.
       */
      note: {
        label: "the freshness window",
        text: "The installation connected before. Its last heartbeat is older than the freshness window this screen judges Connected by.",
      },
    };
  }

  const quarantined =
    (operations?.quarantine_count ?? 0) + (operations?.backend_quarantine_count ?? 0);
  if (quarantined > 0) {
    return {
      sentence:
        "Connected, with events being refused. Some of what this installation sent is in quarantine. Waiting on MADSPACE operations: read the operational figures below before trusting a count from this source.",
      tone: "weak",
      note: null,
    };
  }

  if (view.queueFillPercent !== null && view.queueFillPercent >= 80) {
    return {
      sentence: `Connected, with the outbox ${percent(view.queueFillPercent).text} full. Waiting on the installation to drain it.`,
      tone: "weak",
      note: {
        label: "the outbox ceiling",
        text: "If the fill keeps climbing, events will start being refused for capacity.",
      },
    };
  }

  if (!states.ingestionVerified) {
    return {
      sentence:
        "Connected, and no analytics verified. Waiting on the installation for an event that reaches storage.",
      tone: "watch",
      note: {
        label: "the Ingestion verified state",
        text: "Heartbeats are arriving, and no event has yet been proved to reach storage.",
      },
    };
  }

  const verified = instant(operations?.ingestion_verified_at ?? null);
  const lastVerified = verified.missing ? "" : `, last verified on ${verified.text}`;
  return {
    sentence: `Configured, connected and delivering verified analytics${lastVerified}. Nothing is waited on.`,
    tone: "good",
    note: {
      label: "the three states",
      text: "All three states hold, the heartbeat is fresh, and nothing is quarantined.",
    },
  };
}
