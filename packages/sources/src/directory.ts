import type { AdminRefusal, AdminResult } from "./admin";
import type {
  ObserverDb,
  ProjectAgentRow,
  ProjectDirectoryRow,
  ProjectViewerRow,
  TenantRow,
} from "./db";

/**
 * THE PROJECT DIRECTORY — what turns a control-plane project into something a
 * customer can open: a developer, an address, a currency, a locale, a time
 * zone, who may view it, and the names of the people who present on it.
 *
 * Same rules as `admin.ts`: the account first and checked first, refusals that
 * name a field and never a value, and no interpretation of a driver's error. A
 * slug somebody else holds raises from the database; the surface that offers
 * the form checks beforehand, where it can also say which one is free.
 *
 * ## The validity the database cannot decide
 *
 * A currency, a locale and a time zone are checked HERE, with `Intl`, because
 * the two implementations of the port must refuse the same inputs and a PGlite
 * and a hosted Postgres need not agree on what zones exist. The migration checks
 * shapes only. `Intl` is the runtime's own table, and it is the table the
 * dashboard will format with, so "valid" means exactly "will render".
 */

/* --- shapes, shared with the form that feeds them -------------------------------- */

/** A developer's slug: the first segment of every address. Mirrors `tenants_slug_shape`. */
export const TENANT_SLUG = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

/** A project's slug. Mirrors `observer_project_settings_set`. */
export const PROJECT_SLUG = /^[a-z0-9]([a-z0-9-]{0,118}[a-z0-9])?$/;

/**
 * Words a developer's slug may not be, because the application routes them.
 * Mirrors `tenants_slug_not_a_route`; kept here too so a form can say so in
 * words instead of surfacing a constraint violation.
 */
export const RESERVED_TENANT_SLUGS: readonly string[] = [
  "sign-in",
  "projects",
  "settings",
  "madspace",
  "design-lab",
  "lab",
  "iris",
  "api",
  "functions",
  "brand",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value) && Intl.supportedValuesOf("currency").includes(value);
}

export function isLocale(value: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([value]).length === 1;
  } catch {
    return false;
  }
}

export function isTimeZone(value: string): boolean {
  if (value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/* --- inputs ------------------------------------------------------------------------ */

export interface CreateTenantInput {
  readonly account: string;
  readonly name: string;
  readonly slug: string;
}

export interface ProjectSettingsInput {
  readonly account: string;
  readonly project: string;
  readonly tenant: string;
  readonly slug: string;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
}

export interface ViewerGrantInput {
  readonly account: string;
  readonly project: string;
  /** The application's account identifier for the person. */
  readonly viewer: string;
  /** Who is doing this, for the record. */
  readonly by: string;
}

export interface NameAgentInput {
  readonly account: string;
  readonly project: string;
  /** Exactly what the showroom sends as `agent_id`. */
  readonly agent: string;
  readonly name: string;
}

/* --- the service -------------------------------------------------------------------- */

export interface ProjectDirectoryAdmin {
  createTenant(input: CreateTenantInput): Promise<AdminResult<string>>;
  tenants(input: { readonly account: string }): Promise<AdminResult<readonly TenantRow[]>>;
  /**
   * `unknown_project` covers a project that is not this account's, a developer
   * of another estate, and a call that would move a project or change its
   * address. The surface reads the directory first and can say which.
   */
  setProjectSettings(input: ProjectSettingsInput): Promise<AdminResult<null>>;
  directory(input: {
    readonly account: string;
  }): Promise<AdminResult<readonly ProjectDirectoryRow[]>>;
  grantViewer(input: ViewerGrantInput): Promise<AdminResult<null>>;
  revokeViewer(input: ViewerGrantInput): Promise<AdminResult<null>>;
  viewers(input: {
    readonly account: string;
    readonly project: string;
  }): Promise<AdminResult<readonly ProjectViewerRow[]>>;
  nameAgent(input: NameAgentInput): Promise<AdminResult<null>>;
  agents(input: {
    readonly account: string;
    readonly project: string;
  }): Promise<AdminResult<readonly ProjectAgentRow[]>>;
}

const invalid = (field: string): AdminRefusal => ({ code: "invalid_input", field });

function text(value: unknown, field: string, max: number): AdminRefusal | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    return invalid(field);
  }
  return null;
}

function uuid(value: unknown, field: string): AdminRefusal | null {
  return typeof value === "string" && UUID.test(value) ? null : invalid(field);
}

function firstProblem(problems: readonly (AdminRefusal | null)[]): AdminRefusal | null {
  for (const problem of problems) if (problem !== null) return problem;
  return null;
}

const ok = <T>(value: T): AdminResult<T> => ({ ok: true, value });
const no = <T>(refusal: AdminRefusal): AdminResult<T> => ({ ok: false, refusal });

/** A complete project: every field the customer side needs is present. */
export type CompleteProjectRow = ProjectDirectoryRow & {
  readonly slug: string;
  readonly tenant_id: string;
  readonly tenant_name: string;
  readonly tenant_slug: string;
  readonly currency: string;
  readonly locale: string;
  readonly time_zone: string;
};

export function isComplete(row: ProjectDirectoryRow): row is CompleteProjectRow {
  return (
    row.slug !== null &&
    row.tenant_id !== null &&
    row.tenant_name !== null &&
    row.tenant_slug !== null &&
    row.currency !== null &&
    row.locale !== null &&
    row.time_zone !== null
  );
}

export function projectDirectoryAdmin(deps: { readonly db: ObserverDb }): ProjectDirectoryAdmin {
  const { db } = deps;

  return {
    async createTenant(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        text(input.name, "name", 200),
        typeof input.slug === "string" &&
        TENANT_SLUG.test(input.slug) &&
        !RESERVED_TENANT_SLUGS.includes(input.slug)
          ? null
          : invalid("slug"),
      ]);
      if (problem !== null) return no(problem);
      return ok(
        await db.tenantCreate({
          account: input.account,
          name: input.name.trim(),
          slug: input.slug,
        }),
      );
    },

    async tenants(input) {
      const problem = text(input.account, "account", 200);
      if (problem !== null) return no(problem);
      return ok(await db.tenantsForAccount(input.account));
    },

    async setProjectSettings(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        uuid(input.project, "project"),
        uuid(input.tenant, "tenant"),
        typeof input.slug === "string" && PROJECT_SLUG.test(input.slug) ? null : invalid("slug"),
        typeof input.currency === "string" && isCurrency(input.currency)
          ? null
          : invalid("currency"),
        typeof input.locale === "string" && isLocale(input.locale) ? null : invalid("locale"),
        typeof input.timeZone === "string" && isTimeZone(input.timeZone)
          ? null
          : invalid("timeZone"),
      ]);
      if (problem !== null) return no(problem);

      const moved = await db.projectSettingsSet(input);
      return moved ? ok(null) : no({ code: "unknown_project", field: "project" });
    },

    async directory(input) {
      const problem = text(input.account, "account", 200);
      if (problem !== null) return no(problem);
      return ok(await db.projectDirectory(input.account));
    },

    async grantViewer(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        uuid(input.project, "project"),
        text(input.viewer, "viewer", 200),
        text(input.by, "by", 200),
      ]);
      if (problem !== null) return no(problem);
      const stands = await db.projectViewerGrant({
        account: input.account,
        project: input.project,
        viewer: input.viewer,
        grantedBy: input.by,
      });
      return stands ? ok(null) : no({ code: "unknown_project", field: "project" });
    },

    async revokeViewer(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        uuid(input.project, "project"),
        text(input.viewer, "viewer", 200),
        text(input.by, "by", 200),
      ]);
      if (problem !== null) return no(problem);
      const revoked = await db.projectViewerRevoke({
        account: input.account,
        project: input.project,
        viewer: input.viewer,
        revokedBy: input.by,
      });
      /* False is "no standing grant", for this account's project or anybody's. */
      return revoked ? ok(null) : no({ code: "unknown_project", field: "viewer" });
    },

    async viewers(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        uuid(input.project, "project"),
      ]);
      if (problem !== null) return no(problem);
      return ok(await db.projectViewers(input));
    },

    async nameAgent(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        uuid(input.project, "project"),
        text(input.agent, "agent", 128),
        text(input.name, "name", 120),
      ]);
      if (problem !== null) return no(problem);
      const named = await db.projectAgentNameSet({
        account: input.account,
        project: input.project,
        agent: input.agent,
        name: input.name.trim(),
      });
      return named ? ok(null) : no({ code: "unknown_project", field: "project" });
    },

    async agents(input) {
      const problem = firstProblem([
        text(input.account, "account", 200),
        uuid(input.project, "project"),
      ]);
      if (problem !== null) return no(problem);
      return ok(await db.projectAgents(input));
    },
  };
}
