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
 */

export interface Reading {
  readonly text: string;
  readonly missing: boolean;
}

/** What an unmeasured number says. A heartbeat's payload is optional by design. */
export const NOT_REPORTED = "Not reported";

const present = (text: string): Reading => ({ text, missing: false });
const absent = (text: string = NOT_REPORTED): Reading => ({ text, missing: true });

/* --- instants ------------------------------------------------------------------ */

/**
 * An instant, in UTC, formatted by hand rather than by `Intl`.
 *
 * The facades emit `YYYY-MM-DDTHH:MM:SSZ` and these pages are server-rendered,
 * so a locale-aware formatter would print whatever the host's locale happens to
 * be — which on Vercel is not the operator's, and on a development machine is
 * not the same as on Vercel. A fixed UTC rendering is the same everywhere and
 * matches the timestamps in the database an operator will compare it against.
 */
export function instant(value: string | null, whenAbsent = "Never"): Reading {
  if (value === null) return absent(whenAbsent);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return absent(whenAbsent);
  const iso = new Date(parsed).toISOString();
  return present(`${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`);
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
 */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
}

/** An age measured in seconds by the plugin, or the fact that it was not measured. */
export function ageSeconds(value: number | null): Reading {
  return value === null ? absent() : present(duration(value));
}

/* --- quantities ----------------------------------------------------------------- */

/** A count. Zero is a real count and is rendered as one; null is not. */
export function count(value: number | null, unit?: string): Reading {
  if (value === null) return absent();
  const figure = value.toLocaleString("en-GB");
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
  if (value < 1000) return present(`${value} B`);
  const units = ["kB", "MB", "GB", "TB"] as const;
  let scaled = value / 1000;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  const label = units[unit] ?? "kB";
  return present(`${scaled < 10 ? scaled.toFixed(1) : Math.round(scaled).toString()} ${label}`);
}

/** A percentage that was actually computable. `queueFill` already returns null otherwise. */
export function percent(value: number | null): Reading {
  return value === null ? absent() : present(`${Math.round(value)}%`);
}

/** Free text a heartbeat reported, or the fact that it reported none. */
export function reported(value: string | null): Reading {
  return value === null || value.trim().length === 0 ? absent() : present(value);
}

/* --- vocabulary ------------------------------------------------------------------ */

/** Lifecycle, as a word. The column holds the truth; this only capitalises it. */
export function lifecycleWord(state: string): string {
  if (state === "active") return "Active";
  if (state === "suspended") return "Suspended";
  if (state === "archived") return "Archived";
  return state;
}

/** Source type, as a phrase an operator would say out loud. */
export function sourceTypeWord(type: string): string {
  if (type === "showroom_ue5") return "IRIS showroom (UE5)";
  if (type === "web_iris") return "WEBIRIS";
  if (type === "crm") return "CRM";
  if (type === "communication") return "Communication";
  if (type === "manual_admin") return "Manual (admin)";
  return type;
}

/** Environment, capitalised. Authoritative — never what a client reported. */
export function environmentWord(environment: string): string {
  return environment.slice(0, 1).toUpperCase() + environment.slice(1);
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
  return { word: state, tone: "unknown" };
}

/* --- the two-second answer --------------------------------------------------------- */

export interface InstallationAnswer {
  /** One sentence, composed from persisted state and nothing else. */
  readonly sentence: string;
  readonly tone: "good" | "watch" | "weak" | "unknown";
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
 * The clauses are written to name the thing an operator does next, because the
 * commonest reading of this screen ends after this line.
 */
export function installationAnswer(view: SourceView, now: Date): InstallationAnswer {
  const { states, operations, heartbeatFresh, status } = view;

  if (status.state === "archived") {
    return {
      sentence:
        "Archived. This source is terminal — nothing further is expected from the installation, and its state is kept for the record rather than for operation.",
      tone: "unknown",
    };
  }

  if (status.state === "suspended") {
    return {
      sentence:
        "Suspended. The installation is switched off deliberately; what it sends is refused until an operator resumes it.",
      tone: "watch",
    };
  }

  if (!states.activated) {
    return {
      sentence:
        "Not activated. No credential exchange has ever completed for this source, so the installation cannot send anything yet. Issue an activation code and enter it in the plugin.",
      tone: "unknown",
    };
  }

  if (!states.connected) {
    return {
      sentence:
        "Activated, and never connected. A credential exists, and no heartbeat has ever been accepted — the installation has not reached us since it was activated.",
      tone: "watch",
    };
  }

  if (!heartbeatFresh) {
    const age = ageSince(operations?.last_heartbeat_at ?? null, now);
    return {
      sentence: `Offline. The installation connected before, and its last heartbeat arrived ${age ?? "some time ago"} — older than the fifteen-minute freshness window this screen judges Connected by.`,
      tone: "watch",
    };
  }

  if (!states.ingestionVerified) {
    return {
      sentence:
        "Connected, and no analytics verified. Heartbeats are arriving, and no event has yet been proved to reach storage — the installation can talk to us but has not shown that its data lands.",
      tone: "watch",
    };
  }

  const quarantined =
    (operations?.quarantine_count ?? 0) + (operations?.backend_quarantine_count ?? 0);
  if (quarantined > 0) {
    return {
      sentence:
        "Connected and verified, with events being refused. Analytics reaches storage, and some of what this installation sent is in quarantine — read the operational figures below before trusting a count from this source.",
      tone: "weak",
    };
  }

  if (view.queueFillPercent !== null && view.queueFillPercent >= 80) {
    return {
      sentence:
        "Connected and verified, with the outbox close to its ceiling. Analytics reaches storage, and the installation is holding more than it usually does — if the fill keeps climbing, events will start being refused for capacity.",
      tone: "weak",
    };
  }

  return {
    sentence:
      "Configured, connected and delivering verified analytics. All three states hold, the heartbeat is fresh, and nothing is quarantined.",
    tone: "good",
  };
}
