import { notFound } from "next/navigation";

import { labGate } from "../gate";

/**
 * Every other address under `/lab`: the same gate, then not found.
 *
 * Without this page `/lab/<anything>` that is not one of the drawings fell
 * through to `/[tenantSlug]/[projectSlug]`, whose shell sends a visitor with no
 * session to `/sign-in` — so `/lab` answered 404 and `/lab/concept-a` a 307
 * (measured in production, 2026-09-30). Nothing leaked either way; one prefix
 * answering two ways is where a later change turns one of them into a render.
 */
export default async function LabUnknown() {
  await labGate();
  notFound();
}
