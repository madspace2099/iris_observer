import "server-only";

import {
  DEFAULT_LANGUAGE,
  NotFoundError,
  NotPermittedError,
  PERIOD_PRESETS,
  type AgentSummary,
  type TenantSummary,
  type Viewer,
} from "@observer/readmodels";

import { companyOf, viewerForAccount, type Account } from "@/lib/accounts";
import { repository } from "@/lib/repository";
import { currentAccount } from "@/lib/session";

import type { PortraitActor } from "./access";
import { portraitStore } from "./store";

/** The address an agent's portrait is served from, and changed at. */
export function portraitEndpoint(tenantSlug: string, projectSlug: string, agentId: string): string {
  return `/api/observer/portraits/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(projectSlug)}/${encodeURIComponent(agentId)}`;
}

/** Who is asking, in the terms `portraitRight` decides on. */
export function actorFor(account: Account, viewer: Viewer): PortraitActor {
  const company = companyOf(account);
  return {
    role: viewer.role,
    agentId: viewer.agentId,
    companyName: company.name,
    companyRole: company.role,
  };
}

export type PortraitScope =
  | {
      readonly ok: true;
      readonly account: Account;
      readonly viewer: Viewer;
      readonly tenant: TenantSummary;
      readonly agent: AgentSummary;
    }
  | { readonly ok: false; readonly status: 401 | 404 };

/**
 * The signed-in reader, the tenant, and the agent, or why not.
 *
 * The reader must hold the project (the repository's own tenant and project
 * check, the one every page makes), and the agent must be one Observer already
 * knows on it: a presenter in any of the periods a reader can choose. A
 * project the reader does not hold and an agent who is not on it answer the
 * same 404, so the route cannot be used to learn who presents elsewhere.
 */
export async function resolvePortraitScope(
  tenantSlug: string,
  projectSlug: string,
  agentId: string,
): Promise<PortraitScope> {
  const account = await currentAccount();
  if (account === null) return { ok: false, status: 401 };
  const viewer = await viewerForAccount(account);

  let tenant: TenantSummary;
  try {
    ({ tenant } = await repository.resolveProject(viewer, tenantSlug, projectSlug));
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof NotPermittedError) {
      return { ok: false, status: 404 };
    }
    throw error;
  }

  for (const period of PERIOD_PRESETS) {
    const roster = await repository.listAgents({
      viewer,
      tenantSlug,
      projectSlug,
      period,
      language: DEFAULT_LANGUAGE,
    });
    const agent = roster.find((a) => a.agentId === agentId);
    if (agent !== undefined) return { ok: true, account, viewer, tenant, agent };
  }
  return { ok: false, status: 404 };
}

/**
 * The image address of every listed agent who has a portrait, keyed by agent id.
 *
 * The page asking has already read the project for this reader; the route that
 * serves each image checks again. The version in the address changes with the
 * portrait, so a replaced face is fetched anew. Empty where there is no store.
 */
export async function portraitSources(
  tenant: Pick<TenantSummary, "id" | "slug">,
  projectSlug: string,
  agentIds: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  const store = portraitStore();
  if (store === null) return {};
  const found = await Promise.all(
    agentIds.map(async (agentId) => {
      const version = await store.version({ tenantId: tenant.id as string, agentId });
      return version === null
        ? null
        : ([
            agentId,
            `${portraitEndpoint(tenant.slug, projectSlug, agentId)}?v=${version}`,
          ] as const);
    }),
  );
  return Object.fromEntries(found.filter((entry) => entry !== null));
}
