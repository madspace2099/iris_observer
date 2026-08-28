import { DEMO_PROJECTS } from "./fixtures";
import type { Selection } from "./metrics";
import type { ChannelFilter, RangeKey } from "./types";

/**
 * Next hands repeated query keys as arrays; the selection only ever wants the
 * first value. One helper rather than the same three lines in three pages.
 */
export function flattenParams(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) out[key] = first;
  }
  return out;
}

export const RANGES: readonly RangeKey[] = ["7d", "28d", "90d"];
export const CHANNELS: readonly ChannelFilter[] = ["all", "web", "showroom"];

/**
 * The selection a URL describes, with every unknown value falling back.
 *
 * SERVER-SAFE ON PURPOSE. It lived beside the shell, which is a client
 * component, so a page calling it from the server got "attempted to call a
 * client function from the server" — the module boundary, saying exactly what
 * it should. Parsing a query string is not client work, so it moved here.
 */
export function selectionFrom(params: URLSearchParams): Selection {
  const project = params.get("project") ?? "";
  const range = params.get("range") ?? "";
  const channel = params.get("channel") ?? "";
  return {
    projectId: DEMO_PROJECTS.some((p) => p.id === project) ? project : "ister-tower",
    range: RANGES.includes(range as RangeKey) ? (range as RangeKey) : "28d",
    channel: CHANNELS.includes(channel as ChannelFilter) ? (channel as ChannelFilter) : "all",
  };
}
