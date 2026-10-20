import "server-only";

import {
  DEFAULT_LANGUAGE,
  type ProjectDiagnostics,
  type SourceKind,
  type Viewer,
} from "@observer/readmodels";
import { isComplete } from "@observer/sources";

import type { MarkTone } from "@/components/madspace/StatusMark";
import { directoryRows } from "@/lib/directory/rows";
import { projectSummaries } from "@/lib/madspace/estate";
import { count, duration } from "@/lib/madspace/format";
import { readModelProjectIdFor, repository } from "@/lib/repository";
import { controlPlane } from "@/lib/sources/control-plane";

/**
 * EVERY PROJECT MADSPACE CAN SEE, BY COMPANY (ADR-0047).
 *
 * Two places hold projects: the demonstration world and whatever the control
 * plane's directory completed, both read through the repository; and the
 * control plane itself, where a project made in administration lives before it
 * has a developer and an address. One list joins them. A control-plane project
 * that is the twin of a repository project (the same project made complete, or
 * matched by address) lends that row its operations pages; one that is neither
 * is listed on its own as needing setup.
 *
 * The figures are the repository's `ProjectDiagnostics`; this file only joins
 * and names, so a screen reading it computes nothing.
 */

export interface PortfolioProject {
  readonly key: string;
  readonly name: string;
  /** The project's address in Observer. Null until it has a developer and an address. */
  readonly address: { readonly tenantSlug: string; readonly projectSlug: string } | null;
  /** Null when the project is not in Observer yet, or its diagnosis could not be read. */
  readonly diagnostics: ProjectDiagnostics | null;
  /** Its id on the control plane, where it has one: sources, integrations, dashboard. */
  readonly controlPlaneId: string | null;
  readonly status: {
    readonly kind: "live" | "demonstration" | "setup" | "unreadable";
    readonly word: string;
    readonly tone: MarkTone;
  };
}

export interface PortfolioCompany {
  readonly name: string;
  readonly projects: readonly PortfolioProject[];
}

export interface Portfolio {
  readonly companies: readonly PortfolioCompany[];
  /** How many projects, across every company. */
  readonly total: number;
  /** False when no control plane answered; the demonstration projects are still listed. */
  readonly planeReadable: boolean;
  /** The control plane answered and holds no project: where the estate can be built. */
  readonly planeEmpty: boolean;
}

/** The four feeds, in the order a reader meets them. */
export const FEEDS: readonly { readonly kind: SourceKind; readonly label: string }[] = [
  { kind: "showroom", label: "Showroom" },
  { kind: "webiris", label: "WEB IRIS" },
  { kind: "crm", label: "CRM" },
  { kind: "catalogue", label: "Catalogue" },
];

const NO_DEVELOPER = "No developer attached yet";

type StatusKind = PortfolioProject["status"]["kind"];

/** Status in words, with the mark that agrees with it. */
function statusOf(
  diagnostics: ProjectDiagnostics | null,
  inObserver: boolean,
): PortfolioProject["status"] {
  if (!inObserver) {
    return { kind: "setup", word: "Needs setup: no developer or address yet", tone: "operator" };
  }
  if (diagnostics === null) return { kind: "unreadable", word: "Not readable", tone: "wrong" };
  if (diagnostics.data === "demonstration") {
    return { kind: "demonstration", word: "Demonstration data", tone: "none" };
  }
  if (diagnostics.sources.some((source) => source.connected)) {
    return { kind: "live", word: "Live data", tone: "good" };
  }
  return { kind: "setup", word: "Needs setup: no source connected", tone: "operator" };
}

const STATUS_PHRASE: Readonly<Record<StatusKind, string>> = {
  live: "with live data",
  demonstration: "on demonstration data",
  setup: "needing setup",
  unreadable: "not readable",
};

/** The portfolio in one sentence: how many, across how many companies, and in what state. */
export function portfolioSentence(portfolio: Portfolio): string {
  const total = portfolio.total;
  if (total === 0) return "MADSPACE holds no project yet.";
  const kinds = portfolio.companies.flatMap((c) => c.projects.map((p) => p.status.kind));
  const states = (Object.keys(STATUS_PHRASE) as StatusKind[])
    .map((kind) => ({ kind, n: kinds.filter((k) => k === kind).length }))
    .filter(({ n }) => n > 0)
    .map(({ kind, n }) => `${count(n).text} of ${count(total).text} ${STATUS_PHRASE[kind]}`);
  const companies = portfolio.companies.length;
  return `${plural(total, "project", "projects")} across ${plural(companies, "company", "companies")}: ${states.join(", ")}.`;
}

function plural(n: number, one: string, other: string): string {
  return `${count(n).text} ${n === 1 ? one : other}`;
}

/** Connected feeds last heard from more than 24 hours before the project's today. */
export function staleFeeds(diagnostics: ProjectDiagnostics): {
  readonly stale: number;
  readonly connected: number;
} {
  const connected = diagnostics.sources.filter((s) => s.connected);
  return { stale: connected.filter((s) => s.stale).length, connected: connected.length };
}

/** The diagnosis in one sentence: how many client projects, and how many have a stale feed. */
export function diagnosisSentence(portfolio: Portfolio): string {
  const diagnosed = portfolio.companies.flatMap((c) =>
    c.projects.flatMap((p) => (p.diagnostics === null ? [] : [p.diagnostics])),
  );
  if (diagnosed.length === 0) return "No client project in Observer can be diagnosed yet.";
  const stale = diagnosed.filter((d) => staleFeeds(d).stale > 0).length;
  const silent = diagnosed.filter((d) => d.windows[0]?.meetings === 0).length;
  return `${plural(diagnosed.length, "client project", "client projects")} in Observer. ${count(stale).text} of ${count(diagnosed.length).text} have a feed not heard from in over 24 hours; ${count(silent).text} of ${count(diagnosed.length).text} held no meeting in the last 28 days.`;
}

/** An age in whole hours, as a reader says it. */
export function hoursAgo(hours: number): string {
  return hours === 0 ? "under 1 h ago" : `${duration(hours * 3600)} ago`;
}

/** One line per feed: whether it is connected, how long since it was seen, and whether that is stale. */
export function feedsOf(
  diagnostics: ProjectDiagnostics,
): readonly { readonly label: string; readonly text: string; readonly tone: MarkTone }[] {
  return FEEDS.map(({ kind, label }) => {
    const connected = diagnostics.sources.filter((s) => s.kind === kind && s.connected);
    if (connected.length === 0) return { label, text: "not connected", tone: "none" as const };
    const seen = connected.filter((s) => s.ageHours !== null);
    const freshest = seen.reduce<(typeof seen)[number] | null>(
      (best, s) => (best === null || (s.ageHours ?? 0) < (best.ageHours ?? 0) ? s : best),
      null,
    );
    if (freshest === null) return { label, text: "never seen", tone: "await" as const };
    const age = hoursAgo(freshest.ageHours ?? 0);
    return freshest.stale
      ? { label, text: `${age}, stale`, tone: "wrong" as const }
      : { label, text: age, tone: "good" as const };
  });
}

async function diagnose(
  viewer: Viewer,
  tenantSlug: string,
  projectSlug: string,
): Promise<ProjectDiagnostics | null> {
  try {
    return await repository.getProjectDiagnostics({
      viewer,
      tenantSlug,
      projectSlug,
      period: "quarter_to_date",
      language: DEFAULT_LANGUAGE,
    });
  } catch (error: unknown) {
    console.error(
      "[madspace.portfolio] a project could not be diagnosed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return null;
  }
}

/**
 * The control plane's projects, sorted into twins of a repository project
 * (keyed by its read-model id) and the ones Observer does not hold yet. Read
 * fresh rather than through the directory's memo for the list itself, so a
 * project made a moment ago is on the next render.
 */
async function controlPlaneProjects() {
  const plane = await controlPlane();
  const [projects, rows] = plane.ok
    ? await Promise.all([projectSummaries(plane.admin), directoryRows()])
    : [[], []];

  const twins = new Map<string, string>();
  const waiting: { readonly id: string; readonly name: string; readonly company: string }[] = [];
  for (const project of projects) {
    const row = rows.find((r) => r.project_id === project.projectId);
    const readModelId = readModelProjectIdFor({
      slug: row?.slug ?? null,
      name: project.name,
      projectUuid: project.projectId,
      complete: row !== undefined && isComplete(row),
    });
    if (readModelId === null) {
      waiting.push({
        id: project.projectId,
        name: project.name,
        company: row?.tenant_name ?? NO_DEVELOPER,
      });
    } else {
      twins.set(readModelId, project.projectId);
    }
  }
  return { readable: plane.ok, empty: plane.ok && projects.length === 0, twins, waiting };
}

export async function portfolio(viewer: Viewer): Promise<Portfolio> {
  const [tenants, plane] = await Promise.all([
    repository.listTenants(viewer),
    controlPlaneProjects(),
  ]);

  const companies: PortfolioCompany[] = await Promise.all(
    tenants.map(async (tenant) => {
      const projects = await repository.listProjects(viewer, tenant.id);
      return {
        name: tenant.name,
        projects: await Promise.all(
          projects.map(async (project): Promise<PortfolioProject> => {
            const diagnostics = await diagnose(viewer, tenant.slug, project.slug);
            return {
              key: project.id as string,
              name: project.name,
              address: { tenantSlug: tenant.slug, projectSlug: project.slug },
              diagnostics,
              controlPlaneId: plane.twins.get(project.id as string) ?? null,
              status: statusOf(diagnostics, true),
            };
          }),
        ),
      };
    }),
  );

  /* Projects Observer does not hold yet, under their developer where they have one. */
  for (const project of plane.waiting) {
    const row: PortfolioProject = {
      key: project.id,
      name: project.name,
      address: null,
      diagnostics: null,
      controlPlaneId: project.id,
      status: statusOf(null, false),
    };
    const index = companies.findIndex((company) => company.name === project.company);
    const company = companies[index];
    if (company === undefined) companies.push({ name: project.company, projects: [row] });
    else companies[index] = { ...company, projects: [...company.projects, row] };
  }

  const held = companies.filter((company) => company.projects.length > 0);
  return {
    companies: held,
    total: held.reduce((sum, company) => sum + company.projects.length, 0),
    planeReadable: plane.readable,
    planeEmpty: plane.empty,
  };
}

/** One project in Observer, as the portfolio states it, or null where the address resolves to nothing. */
export async function portfolioProject(
  viewer: Viewer,
  tenantSlug: string,
  projectSlug: string,
): Promise<{ readonly company: string; readonly project: PortfolioProject } | null> {
  let resolved;
  try {
    resolved = await repository.resolveProject(viewer, tenantSlug, projectSlug);
  } catch {
    return null;
  }
  const [diagnostics, plane] = await Promise.all([
    diagnose(viewer, tenantSlug, projectSlug),
    controlPlaneProjects(),
  ]);
  return {
    company: resolved.tenant.name,
    project: {
      key: resolved.project.id as string,
      name: resolved.project.name,
      address: { tenantSlug, projectSlug },
      diagnostics,
      controlPlaneId: plane.twins.get(resolved.project.id as string) ?? null,
      status: statusOf(diagnostics, true),
    },
  };
}
