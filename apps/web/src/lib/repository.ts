import type { ObserverRepository } from "@observer/readmodels";
import { isComplete } from "@observer/sources";
import { PROJECTS, SyntheticObserverRepository, TENANTS } from "@observer/synthetic";

import { liveCatalogueSource } from "@/lib/connectors/catalogue-source";
import { liveDealSource } from "@/lib/connectors/deal-source";
import { liveSessionSource } from "@/lib/connectors/session-source";
import { projectIdFromUuid } from "@/lib/directory/identity";
import { liveProjectDirectory } from "@/lib/directory/live";
import { directoryRows } from "@/lib/directory/rows";

function normalised(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The read-model project id for a control-plane project row, or `null`.
 *
 * The MADSPACE Integrations screen syncs a showroom-telemetry source by
 * control-plane project UUID, but the sessions it fetches are stamped with
 * the READ-MODEL project id — the same identity `session-source.ts`'s own
 * twin match resolves in the other direction. This is that match run in
 * reverse, and it lives here rather than beside it because only the
 * composition root, `session.ts` and `accounts.ts` may name the synthetic
 * world (ADR-0007, `apps/web/test/surfaces.test.ts`) — a connector adapter
 * asking a control-plane row to become a read-model id is exactly the
 * fixture-reading a component must not do for itself. `null` means no
 * synthetic-world project answers to this row yet, which the sync action
 * turns into a sentence rather than stamping a wrong or invented id.
 *
 * A COMPLETE row is its own project (`docs/21-self-served-projects.md`): its
 * read-model id is its uuid rewritten, and it is never matched to a fixture by
 * name, so a fresh project called "ISTER TOWER" cannot be mistaken for the
 * demonstration of that name. Pass `complete` from `isComplete(row)`.
 */
export function readModelProjectIdFor(twin: {
  readonly slug: string | null;
  readonly name: string;
  readonly projectUuid?: string;
  readonly complete?: boolean;
}): string | null {
  if (twin.complete === true && twin.projectUuid !== undefined) {
    return projectIdFromUuid(twin.projectUuid) as string;
  }
  const project =
    PROJECTS.find((p) => twin.slug !== null && p.slug === twin.slug) ??
    PROJECTS.find((p) => normalised(p.name) === normalised(twin.name)) ??
    null;
  return project === null ? null : (project.id as string);
}

/**
 * Whether a developer of the synthetic world already lives at this address.
 * Asked here because only this file may name that world; administration refuses
 * such a slug so a developer it registers can never be shadowed by a fixture.
 */
export function isSyntheticTenantSlug(slug: string): boolean {
  return TENANTS.some((tenant) => tenant.slug === slug);
}

/**
 * The same question for a row of the estate, answered with what the directory
 * knows about it: a complete project is itself, anything else is a fixture's
 * twin or nothing.
 */
export async function readModelProjectIdForRow(row: {
  readonly project_id: string;
  readonly slug: string | null;
  readonly name: string;
}): Promise<string | null> {
  const complete = (await directoryRows()).some(
    (known) => known.project_id === row.project_id && isComplete(known),
  );
  return readModelProjectIdFor({
    slug: row.slug,
    name: row.name,
    projectUuid: row.project_id,
    complete,
  });
}

/**
 * The composition root.
 *
 * The single place in the application that knows which repository is in use.
 * Every screen imports `repository`, never `@observer/synthetic`, so swapping
 * the synthetic implementation for the database one is a change to this file
 * and nothing else (ADR-0007).
 *
 * Two things composed in today, both from ADR-0036: the catalogue source,
 * whose stock replaces the synthetic stock for a project with a synced
 * connector — the stock, not the sessions — and the deal source, whose
 * deals draw the Sales Flow ladder; without it the ladder says the CRM is
 * not connected.
 *
 * And the project directory: the projects made in administration, listed and
 * resolved beside the synthetic world's own and fed by the same three sources.
 */
export const repository: ObserverRepository = new SyntheticObserverRepository({
  catalogueSource: liveCatalogueSource,
  dealSource: liveDealSource,
  sessionSource: liveSessionSource,
  projectDirectory: liveProjectDirectory,
});

/*
 * THE MODEL TRANSPORT, INSTALLED ONCE.
 *
 * `ai/provider.ts` resolves which model answers; `providers/transport.ts`
 * knows how to reach five vendors. The first cannot import the second without a
 * cycle, so the composition root — this file, which every surface already
 * imports — introduces them.
 */
import { useModelBuilder } from "@/lib/ai/provider";
import { modelFor } from "@/lib/providers/transport";

useModelBuilder(modelFor);
