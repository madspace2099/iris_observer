import { outcomeIsUnknown, type ShowroomSession } from "@observer/contracts";
import {
  STALE_AFTER_HOURS,
  type DeliveredDeals,
  type DiagnosedSource,
  type DiagnosisWindow,
  type Period,
  type ProjectDiagnostics,
  type ViewContext,
} from "@observer/readmodels";

const HOUR_MS = 60 * 60 * 1000;

/**
 * One project, diagnosed for MADSPACE (ADR-0047).
 *
 * Pure: the repository resolves the project, its clock, its windows and what
 * its sources delivered, and this only counts. Every count keeps the slice it
 * was counted from as its denominator, and anything the project does not have
 * stays null rather than becoming a zero.
 */
export function buildProjectDiagnostics(
  context: ViewContext,
  input: {
    readonly windows: readonly {
      readonly period: Period;
      readonly sessions: readonly ShowroomSession[];
    }[];
    readonly history: readonly ShowroomSession[];
    readonly roster: readonly string[] | null;
    readonly deals: DeliveredDeals | null;
    readonly catalogueCodes: readonly string[];
  },
): ProjectDiagnostics {
  const asOf = context.generatedAt;
  const now = Date.parse(asOf);
  const project = context.project;
  /* Already bounded by the repository to the horizon the windows count to, so no window holds more. */
  const recorded = input.history;
  const last = recorded.reduce<string | null>(
    (latest, s) => (latest === null || s.startedAt > latest ? s.startedAt : latest),
    null,
  );
  const catalogue = new Set(input.catalogueCodes);
  const roster = input.roster === null ? null : new Set(input.roster);

  const sources: DiagnosedSource[] = project.sources.map((source) => {
    const seen = source.lastSeenAt === null ? Number.NaN : Date.parse(source.lastSeenAt);
    const age = Number.isFinite(seen) ? Math.max(0, now - seen) : null;
    return {
      name: source.displayName,
      kind: source.kind,
      connected: source.connected,
      lastSeenAt: source.lastSeenAt,
      ageHours: age === null ? null : Math.floor(age / HOUR_MS),
      stale: age !== null && age > STALE_AFTER_HOURS * HOUR_MS,
    };
  });

  const windows: DiagnosisWindow[] = input.windows.map(({ period, sessions }) => {
    const presenters = new Set(sessions.map((s) => s.agentId));
    const opened = new Set(
      sessions.flatMap((s) => s.units.map((u) => u.unitCode)).filter((code) => catalogue.has(code)),
    );
    return {
      period,
      meetings: sessions.length,
      presenters: presenters.size,
      rosterPresenting:
        roster === null ? null : [...presenters].filter((id) => roster.has(id)).length,
      outcomeRecorded: sessions.filter((s) => !outcomeIsUnknown(s.outcome)).length,
      timingUnavailable: sessions.filter((s) => s.timingUnavailable).length,
      webiris: sessions.filter((s) => s.channel === "webiris").length,
      unitsOpened: opened.size,
    };
  });

  const crmConnected = project.connectedSources.includes("crm");
  const catalogueConnected = project.connectedSources.includes("catalogue");

  return {
    asOf,
    data: context.ownDataOnly ? "own" : context.sessionsDelivered ? "delivered" : "demonstration",
    roster: roster === null ? null : roster.size,
    recorded: recorded.length,
    legacyImports: recorded.filter((s) => s.timingUnavailable).length,
    lastMeetingAt: last,
    sources,
    crm: {
      connected: crmConnected,
      deals: input.deals === null ? null : input.deals.deals.length,
      fetchedAt: input.deals?.fetchedAt ?? null,
    },
    catalogueUnits: catalogue.size === 0 && !catalogueConnected ? null : catalogue.size,
    windows,
  };
}
