import type { ObserverRepository } from "@observer/readmodels";
import { SyntheticObserverRepository } from "@observer/synthetic";

import { liveCatalogueSource } from "@/lib/connectors/catalogue-source";
import { liveDealSource } from "@/lib/connectors/deal-source";

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
