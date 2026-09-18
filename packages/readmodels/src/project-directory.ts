import type { ProjectSummary, TenantSummary } from "./context";

/**
 * Where projects that exist OUTSIDE the synthetic world come from, beside
 * `CatalogueSource`, `DealSource` and `ShowroomSessionSource`.
 *
 * A project created in administration has no building rule, no session dataset
 * and no scripted overview: nothing about it is synthetic, so it cannot be one
 * of the world's constants. It is a developer, an address and three settings,
 * held by the control plane, and the repository lists and resolves it beside
 * the world's own projects (`docs/21-self-served-projects.md`).
 *
 * Two properties every reader of these entries may rely on:
 *
 *   - **Only complete projects are here.** Each carries a currency, a locale and
 *     a time zone it can be formatted with, and a tenant that is in `tenants`.
 *     A project still missing one of those is administration's business and is
 *     not an entry.
 *   - **Nothing here grants access.** Who may open an entry is decided where it
 *     always was, against `viewer.tenantIds` and `viewer.projectIds`. The session
 *     layer puts a person's grants into those lists; the directory only says
 *     what exists.
 *
 * `null` means no directory answers: no control plane on this deployment, or it
 * could not be read. The product then has exactly the synthetic world, as before.
 */
export interface DirectoryEntries {
  readonly tenants: readonly TenantSummary[];
  readonly projects: readonly ProjectSummary[];
}

export interface ProjectDirectory {
  entries(): Promise<DirectoryEntries | null>;
}
