import type { ObserverRepository } from "@observer/readmodels";
import { PROJECTS, SyntheticObserverRepository } from "@observer/synthetic";

import { liveCatalogueSource } from "@/lib/connectors/catalogue-source";
import { liveDealSource } from "@/lib/connectors/deal-source";
import { liveSessionSource } from "@/lib/connectors/session-source";

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
 */
export function readModelProjectIdFor(twin: {
  readonly slug: string | null;
  readonly name: string;
}): string | null {
  const project =
    PROJECTS.find((p) => twin.slug !== null && p.slug === twin.slug) ??
    PROJECTS.find((p) => normalised(p.name) === normalised(twin.name)) ??
    null;
  return project === null ? null : (project.id as string);
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
 */
export const repository: ObserverRepository = new SyntheticObserverRepository({
  catalogueSource: liveCatalogueSource,
  dealSource: liveDealSource,
  sessionSource: liveSessionSource,
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
