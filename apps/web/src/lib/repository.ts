import type { ObserverRepository } from "@observer/readmodels";
import { SyntheticObserverRepository } from "@observer/synthetic";

import { liveCatalogueSource } from "@/lib/connectors/catalogue-source";

/**
 * The composition root.
 *
 * The single place in the application that knows which repository is in use.
 * Every screen imports `repository`, never `@observer/synthetic`, so swapping
 * the synthetic implementation for the database one is a change to this file
 * and nothing else (ADR-0007).
 *
 * The one thing composed in today: the catalogue source (ADR-0036). When a
 * project has a connector with a successful sync, its stock replaces the
 * synthetic stock for that project — the stock, not the sessions.
 */
export const repository: ObserverRepository = new SyntheticObserverRepository({
  catalogueSource: liveCatalogueSource,
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
