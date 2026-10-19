/* Variant D's stylesheet is the root layout's since the product adopted it (ADR-0041). */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireViewer } from "@/lib/session";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";

import { labChartsD } from "../../lab-data";
import { GalleryD } from "./gallery";

export const metadata: Metadata = { title: "Design lab · D" };

/**
 * VARIANT D, AT `/design-lab/variants/d`.
 *
 * Not in `[screen]/[variant]`: A, B and C are three hands on the same six
 * control-plane screens, and D is one hand on a different subject — the
 * product's charts — so it has no screen to be a variant of.
 *
 * The lab's gate is repeated here rather than inherited, as the layout's own
 * docblock asks: a layout is not a security boundary, because Next may render a
 * page without re-running an ancestor layout.
 */
export default async function DesignLabVariantD() {
  if (!localControlPlaneEnabled()) notFound();
  const viewer = await requireViewer();
  if (viewer.role !== "madspace_admin") redirect("/");

  return <GalleryD data={await labChartsD(viewer)} />;
}
