import type { Viewer } from "@observer/readmodels";

/**
 * WHO MAY CHANGE AN AGENT'S PORTRAIT (ADR-0054).
 *
 * Observer never creates, renames or removes an agent: the roster arrives from
 * the IRIS showroom. It may only put a face to a name it already holds, and
 * only two people may do that:
 *
 *   - **the admin of the tenant's own company** (ADR-0043), for any agent on
 *     its projects. The owner's Company is the one that receives the agents'
 *     names from its showroom, and the showroom is the tenant's: on Shark
 *     Residence that is Clara Weiss, admin of Shark Developments. The tenant
 *     is always known, where an agent's agency often is not (the UE5 roster
 *     carries no organisation), the same comparison `mayConnectCrm` makes;
 *   - **the agent themselves**, to replace or remove a portrait that is there.
 *     The owner's words: the company adds it, the agent can change their own.
 *
 * Everyone else is refused: the agency's manager and admin, the developer's
 * members, other agents, MADSPACE, which runs the platform and does not curate
 * a customer's people. Whether the reader holds the project at all is settled
 * before this is asked (`resolvePortraitScope`); this decides only the right.
 */
export type PortraitRight = "company_admin" | "self";

export interface PortraitActor {
  readonly role: Viewer["role"];
  readonly agentId: string | null;
  readonly companyName: string;
  readonly companyRole: "admin" | "member";
}

export function portraitRight(
  actor: PortraitActor,
  tenant: { readonly name: string },
  agentId: string,
  hasPortrait: boolean,
): PortraitRight | null {
  if (actor.role === "madspace_admin") return null;
  if (actor.companyRole === "admin" && actor.companyName === tenant.name) return "company_admin";
  if (actor.role === "sales_agent" && actor.agentId === agentId && hasPortrait) return "self";
  return null;
}
