import { cookies } from "next/headers";
import type { Viewer } from "@observer/readmodels";

import { LAST_PROJECT_COOKIE } from "./cookie-names";
import { repository } from "./repository";
import { HOME_SEGMENT } from "./routes";

/**
 * WHERE A SIGNED-IN READER GOES — NOT "THE PROJECTS", ANY MORE.
 *
 * The product used to land every account on `/projects` unconditionally, on
 * the stated principle that "opening a project is a decision a reader makes,
 * not one made for them." Correct for a first sign-in with several projects
 * held; wrong as the ONLY behaviour, for a developer with one project and for
 * an agent who was in the middle of ISTER TOWER five minutes ago. `/projects`
 * remains exactly what it was — reachable from the header on every surface,
 * and the fallback below — it stops being the universal front door.
 *
 * ## The priority, and what each step actually checks
 *
 *   1. Last active project — `middleware.ts` records the tenant/project slug
 *      pair on every project-scoped request, cheaply and without touching a
 *      session or a repository. This function is where that recording is
 *      spent: the cookie is READ here and RE-VALIDATED through
 *      `resolveProject` before it is trusted. A stale cookie naming a project
 *      this account has since lost — or never held, since a cookie is
 *      browser state and this account might not be who wrote it — is refused
 *      identically to a project that never existed, and falls through.
 *   2. A user-set default project. There is no mechanism for this anywhere in
 *      the account model — no field on `Viewer`, no settings screen, no
 *      storage. Adding one is a real feature (a control, a place to persist
 *      it, a decision about whether it is per-account or per-tenant) rather
 *      than a routing fix, so it is skipped rather than invented. `docs/
 *      PROJECT-STATE.md` should record this as the open item it is.
 *   3. Exactly one project. An account that holds only one has nothing to
 *      choose between, and sending it to a picker with one card on it asks a
 *      question with one possible answer.
 *   4. `/projects`. Genuinely more than one project and no remembered one —
 *      this is the case the picker exists for.
 */
export async function resolveLandingPath(viewer: Viewer): Promise<string> {
  const remembered = await landingFromLastProject(viewer);
  if (remembered !== null) return remembered;

  const only = await landingIfOnlyOneProject(viewer);
  if (only !== null) return only;

  return "/projects";
}

async function landingFromLastProject(viewer: Viewer): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(LAST_PROJECT_COOKIE)?.value;
  if (raw === undefined) return null;

  const [tenantSlug, projectSlug] = raw.split("/");
  if (tenantSlug === undefined || projectSlug === undefined || projectSlug === "") return null;

  try {
    const { tenant, project } = await repository.resolveProject(viewer, tenantSlug, projectSlug);
    return `/${tenant.slug}/${project.slug}/${HOME_SEGMENT}`;
  } catch {
    // Stale, mistyped, or belongs to a different account's browser session —
    // refused identically, and the next priority decides instead.
    return null;
  }
}

async function landingIfOnlyOneProject(viewer: Viewer): Promise<string | null> {
  const tenants = await repository.listTenants(viewer);
  const held: { tenantSlug: string; projectSlug: string }[] = [];

  for (const tenant of tenants) {
    const projects = await repository.listProjects(viewer, tenant.id);
    for (const project of projects) {
      held.push({ tenantSlug: tenant.slug, projectSlug: project.slug });
      if (held.length > 1) return null; // already more than one — stop counting
    }
  }

  const only = held[0];
  return only === undefined ? null : `/${only.tenantSlug}/${only.projectSlug}/${HOME_SEGMENT}`;
}
