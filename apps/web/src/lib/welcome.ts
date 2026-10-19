import "server-only";

import { DEFAULT_LANGUAGE, type SourceKind, type Viewer } from "@observer/readmodels";

import { presetFrom } from "./period";
import { repository } from "./repository";

/**
 * WHAT THE WELCOME SAYS, READ FROM THE PROJECT IT OPENS.
 *
 * The sequence after sign-in states five things, and every figure in them is
 * the repository's: the presentations in the default period, the presenters
 * who gave them, the latest meeting's day, and the sources actually connected.
 * Nothing is written for any one project, and a read that is refused or fails
 * leaves its line out rather than printing a number that was never measured.
 */

/** How a connected source is named on screen, in the order the line lists them. */
const SOURCE_WORDS: readonly (readonly [SourceKind, string])[] = [
  ["showroom", "showroom"],
  ["webiris", "WEB IRIS"],
  ["crm", "CRM"],
  ["catalogue", "catalogue"],
];

export interface WelcomeProject {
  readonly name: string;
  readonly sources: readonly string[];
  readonly locale: string;
  /** Null when the period could not be read; the lines that need it are left out. */
  readonly period: {
    readonly label: string;
    readonly meetings: number;
    readonly agents: number;
    /** The newest meeting's day, as the meetings register prints it. */
    readonly latestDay: string | null;
  } | null;
}

export interface WelcomeFacts {
  readonly displayName: string;
  readonly organisationName: string;
  readonly project: WelcomeProject | null;
}

/** The facts behind the welcome, for the destination it hands the reader on to. */
export async function welcomeFacts(viewer: Viewer, destination: string): Promise<WelcomeFacts> {
  const identity = { displayName: viewer.displayName, organisationName: viewer.organisationName };
  const [, tenantSlug = "", projectSlug = ""] = destination.split("/");
  if (tenantSlug === "projects" || tenantSlug === "madspace" || projectSlug === "") {
    return { ...identity, project: null };
  }

  let resolved;
  try {
    resolved = await repository.resolveProject(viewer, tenantSlug, projectSlug);
  } catch {
    return { ...identity, project: null };
  }
  const { project } = resolved;
  const named = {
    name: project.name,
    sources: SOURCE_WORDS.filter(([kind]) => project.connectedSources.includes(kind)).map(
      ([, word]) => word,
    ),
    locale: project.locale,
  };

  try {
    const preset = presetFrom(undefined);
    const query = { viewer, tenantSlug, projectSlug, period: preset, language: DEFAULT_LANGUAGE };
    const [period, meetings, agents] = await Promise.all([
      repository.resolvePeriod(project.id, preset),
      repository.listMeetings(query),
      repository.listAgents(query),
    ]);
    return {
      ...identity,
      project: {
        ...named,
        period: {
          label: period.label,
          meetings: meetings.length,
          agents: agents.length,
          latestDay: meetings[0]?.startedDisplay ?? null,
        },
      },
    };
  } catch {
    return { ...identity, project: { ...named, period: null } };
  }
}

/** The status lines, in the order the welcome types them. */
export function welcomeLines(facts: WelcomeFacts): readonly string[] {
  const identity = `Identity confirmed · ${facts.displayName}, ${facts.organisationName}`;
  const project = facts.project;
  if (project === null) return [identity, "Opening your projects", "Ready"];

  const count = (n: number) => new Intl.NumberFormat(project.locale).format(n);
  const connecting =
    project.sources.length === 0
      ? `Opening ${project.name} · no source connected yet`
      : `Connecting ${project.name} · ${project.sources.join(", ")}`;

  const period = project.period;
  if (period === null) return [identity, connecting, "Briefing ready"];

  const span = period.label.toLowerCase();
  const reading =
    period.meetings === 0
      ? `No presentations recorded · ${span}`
      : `Reading ${count(period.meetings)} ${period.meetings === 1 ? "presentation" : "presentations"} · ${span}`;
  const people =
    period.meetings === 0 || period.latestDay === null
      ? []
      : [
          `${count(period.agents)} ${period.agents === 1 ? "agent" : "agents"} · latest meeting ${period.latestDay}`,
        ];

  return [identity, connecting, reading, ...people, "Briefing ready"];
}
