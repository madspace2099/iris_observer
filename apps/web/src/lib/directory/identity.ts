import {
  ProjectIdSchema,
  TenantIdSchema,
  type ProjectId,
  type TenantId,
} from "@observer/contracts";

/**
 * A CONTROL-PLANE UUID AS A READ-MODEL IDENTIFIER, AND BACK.
 *
 * The control plane keys a project and a developer by uuid; the read models use
 * branded, prefixed identifiers (`prj_…`, `tnt_…`, eight to forty lowercase
 * alphanumerics). A uuid without its hyphens is thirty-two of them, so the
 * mapping is a rewrite and not a lookup: deterministic, reversible, and the same
 * on every instance with no table to keep in step.
 *
 * Reversible is the point. A project that came from the directory is recognised
 * by the SHAPE of its id, so finding its control-plane row is a field read and
 * not a guess by name — which is what the four name matches this replaces were.
 * No fixture id has this shape: the synthetic world's are words
 * (`prj_istertower1`), never thirty-two hex digits.
 */

const HEX32 = /^[0-9a-f]{32}$/;

function body(uuid: string): string {
  return uuid.toLowerCase().replaceAll("-", "");
}

export function projectIdFromUuid(uuid: string): ProjectId {
  return ProjectIdSchema.parse(`prj_${body(uuid)}`);
}

export function tenantIdFromUuid(uuid: string): TenantId {
  return TenantIdSchema.parse(`tnt_${body(uuid)}`);
}

/** The uuid behind a directory identifier, or null for anything else, a fixture's id included. */
export function uuidFromDirectoryId(id: string): string | null {
  const match = /^(?:prj|tnt)_(.+)$/.exec(id);
  const hex = match?.[1];
  if (hex === undefined || !HEX32.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
