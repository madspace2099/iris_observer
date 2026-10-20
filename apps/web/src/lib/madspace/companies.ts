import "server-only";

import type { Viewer } from "@observer/readmodels";
import { projectDirectoryAdmin, type TenantRow } from "@observer/sources";

import { directoryView, type DirectoryPerson } from "@/lib/accounts";
import { repository } from "@/lib/repository";
import { CONTROL_PLANE_ACCOUNT } from "@/lib/sources/control-plane";
import { observerDepsAsync } from "@/lib/sources/deps";

/**
 * THE DIRECTORY IS COMPANIES FIRST (ADR-0047).
 *
 * The owner: "first there should be the companies (Tenants). Then each company
 * could be expandable, with the people belonging to that company inside. I
 * don't understand why Tenants and Agencies had to be separated." So one list:
 * the developers (Observer's tenants, the demonstration's and the control
 * plane's), the sales agencies, and MADSPACE, each with its people from the
 * demonstration directory, a developer with its projects, an agency with the
 * developers it sells for.
 */

export interface Company {
  readonly key: string;
  readonly name: string;
  readonly kind: "developer" | "agency" | "madspace";
  /** A developer's address: the first part of every link to its projects. */
  readonly address: string | null;
  readonly people: readonly DirectoryPerson[];
  /** Its projects in Observer, each with the address it opens at. */
  readonly projects: readonly { readonly name: string; readonly href: string }[];
  /** Projects the control plane registered for it that Observer does not show yet. */
  readonly notYetInObserver: number;
  /** An agency's clients, by name. */
  readonly sellsFor: readonly string[];
  /** Kept by the control plane, as well as or instead of the demonstration. */
  readonly registered: boolean;
}

export interface CompanyDirectory {
  readonly companies: readonly Company[];
  readonly people: number;
  /** False where no control plane holds developers, so none can be added. */
  readonly canAdd: boolean;
}

const ORDER: Readonly<Record<Company["kind"], number>> = { developer: 0, agency: 1, madspace: 2 };

/** The kind, in the word the page shows beside the name. */
export const KIND_WORD: Readonly<Record<Company["kind"], string>> = {
  developer: "Developer",
  agency: "Sales agency",
  madspace: "MADSPACE",
};

const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });
const counted = (n: number, one: string, other: string) => `${String(n)} ${n === 1 ? one : other}`;

/** The directory in one sentence: how many companies of each kind, and how many people. */
export function directorySentence(directory: CompanyDirectory): string {
  const of = (kind: Company["kind"]) => directory.companies.filter((c) => c.kind === kind).length;
  return `${counted(directory.companies.length, "company", "companies")}: ${counted(of("developer"), "developer", "developers")}, ${counted(of("agency"), "sales agency", "sales agencies")} and MADSPACE, with ${counted(directory.people, "person", "people")} in the demonstration directory.`;
}

/** What a closed row says about its company, so it can be read without opening. */
export function companySummary(company: Company): string {
  const people = counted(company.people.length, "person", "people");
  if (company.kind === "agency") {
    return `${people}, sells for ${company.sellsFor.length === 0 ? "no developer yet" : LIST.format(company.sellsFor)}`;
  }
  return `${people}, ${counted(company.projects.length + company.notYetInObserver, "project", "projects")}`;
}

/**
 * The MADSPACE company's name when a tenant is MADSPACE's own, else null.
 *
 * ponytail: a tenant named after MADSPACE ("MADSPACE Integration Sandbox") is
 * MADSPACE's own holding tenant, not a developer, so its projects are listed
 * under MADSPACE on every screen. Matched by name because the world marks it no
 * other way; give tenants a kind when a second such tenant arrives.
 */
export function madspaceOwner(tenantName: string): string | null {
  const madspace = directoryView().companies.find((c) => c.kind === "madspace") ?? null;
  return madspace !== null && tenantName.startsWith(`${madspace.name} `) ? madspace.name : null;
}

/** The developers the control plane holds, or null where there is no control plane to hold any. */
async function registeredDevelopers(): Promise<readonly TenantRow[] | null> {
  const deps = await observerDepsAsync();
  if (deps === null) return null;
  try {
    const read = await projectDirectoryAdmin(deps).tenants({ account: CONTROL_PLANE_ACCOUNT });
    return read.ok ? read.value : [];
  } catch {
    /* A database that stops before the directory migration: the same absence, said the same way. */
    return null;
  }
}

export async function companyDirectory(viewer: Viewer): Promise<CompanyDirectory> {
  const directory = directoryView();
  const [tenants, registered] = await Promise.all([
    repository.listTenants(viewer),
    registeredDevelopers(),
  ]);
  const held = await Promise.all(
    tenants.map(async (tenant) => ({
      tenant,
      projects: (await repository.listProjects(viewer, tenant.id)).map((p) => ({
        name: p.name,
        href: `/${tenant.slug}/${p.slug}/project`,
      })),
    })),
  );

  const peopleOf = (name: string) => directory.people.filter((p) => p.organisation === name);
  const registeredRow = (slug: string) => registered?.find((row) => row.slug === slug) ?? null;
  const ownedByMadspace = (name: string) => madspaceOwner(name) !== null;

  const developers: Company[] = held
    .filter(({ tenant }) => !ownedByMadspace(tenant.name))
    .map(({ tenant, projects }) => {
      const row = registeredRow(tenant.slug);
      return {
        key: `developer:${tenant.slug}`,
        name: tenant.name,
        kind: "developer",
        address: tenant.slug,
        people: peopleOf(tenant.name),
        projects,
        notYetInObserver:
          row === null ? 0 : Math.max(0, Number(row.project_count) - projects.length),
        sellsFor: [],
        registered: row !== null,
      };
    });

  /* Developers the control plane holds that have no project in Observer yet. */
  for (const row of registered ?? []) {
    if (developers.some((d) => d.address === row.slug)) continue;
    developers.push({
      key: `developer:${row.slug}`,
      name: row.name,
      kind: "developer",
      address: row.slug,
      people: peopleOf(row.name),
      projects: [],
      notYetInObserver: Number(row.project_count),
      sellsFor: [],
      registered: true,
    });
  }

  const others: Company[] = directory.companies
    .filter((c) => c.kind !== "developer" || !developers.some((d) => d.name === c.name))
    .map((c) => ({
      key: `${c.kind}:${c.name}`,
      name: c.name,
      kind: c.kind,
      address: null,
      people: c.people,
      projects:
        c.kind === "madspace"
          ? held.filter(({ tenant }) => ownedByMadspace(tenant.name)).flatMap((h) => h.projects)
          : [],
      notYetInObserver: 0,
      sellsFor: c.sellsFor,
      registered: false,
    }));

  return {
    companies: [...developers, ...others].sort(
      (a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name),
    ),
    people: directory.people.length,
    canAdd: registered !== null,
  };
}
