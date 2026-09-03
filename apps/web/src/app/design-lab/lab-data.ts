import "server-only";

import { notFound } from "next/navigation";

import { credentialWord, installationAnswer, type InstallationAnswer } from "@/lib/madspace/format";
import { locateSource } from "@/lib/madspace/estate";
import {
  CONTROL_PLANE_ACCOUNT,
  controlPlane,
  sourceViews,
  HEALTH_LABEL,
  HEALTH_TONE,
  type SourceView,
} from "@/lib/sources/control-plane";
import { demonstrationEstate } from "@/lib/sources/seed";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";
import type { CredentialStatusRow } from "@observer/sources";

/**
 * ONE READ, THREE PRESENTATIONS.
 *
 * The design lab exists to choose a visual direction, and the only way that
 * choice means anything is if the three candidates are looking at the same
 * facts. So the data path is here, once, and it is the SAME path the real
 * Source Detail screen uses: `controlPlane`, `sourceViews`, `credentialStatus`,
 * `installationAnswer`. No fixture, no second read model, no variant-specific
 * shaping.
 *
 * A variant that wanted a figure this does not return would be a variant asking
 * to show something the product does not know, and the answer to that is no
 * rather than a prop.
 *
 * ## What the lab is not
 *
 * It is not a second implementation of the screen. Nothing here decides what a
 * state means, what a verdict is called or how an absent value reads; all of
 * that stays in `control-plane.ts` and `format.ts` where the real screen gets
 * it. The variants receive a finished set of facts and differ only in how they
 * arrange them.
 */

export interface LabSource {
  readonly view: SourceView;
  readonly credential: CredentialStatusRow | null;
  readonly answer: InstallationAnswer;
  readonly healthLabel: string;
  readonly healthTone: (typeof HEALTH_TONE)[keyof typeof HEALTH_TONE];
  readonly projectName: string | null;
  readonly credentialLabel: string;
  readonly now: Date;
}

/**
 * The demonstration source, read as the real screen reads it.
 *
 * `notFound()` rather than a friendly empty state on every failure, because
 * this route is a development instrument and a lab that renders a placeholder
 * when the data is missing is a lab that can show you a layout for facts that
 * are not there. If it cannot read the estate it should not draw anything.
 */
export async function labSource(): Promise<LabSource> {
  if (!localControlPlaneEnabled()) notFound();

  const plane = await controlPlane();
  if (!plane.ok) notFound();

  const estate = await demonstrationEstate(plane.admin);
  if (estate === null) notFound();

  const located = await locateSource(plane.admin, estate.sourceId);
  if (located === null) notFound();

  const now = new Date();
  const views = await sourceViews(plane.admin, located.project_id, now);
  const view = views.find((candidate) => candidate.status.source_id === estate.sourceId);
  if (view === undefined) notFound();

  const credentialResult = await plane.admin.credentialStatus({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
  });
  const credential = credentialResult.ok ? credentialResult.value : null;

  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  const projectName =
    projects.ok === true
      ? (projects.value.find((row) => row.project_id === view.status.project_id)?.name ?? null)
      : null;

  return {
    view,
    credential,
    answer: installationAnswer(view, now),
    healthLabel: HEALTH_LABEL[view.health],
    healthTone: HEALTH_TONE[view.health],
    projectName,
    credentialLabel: credentialWord(credential?.state ?? "").word,
    now,
  };
}

/** The three directions, in the order the brief names them. */
export const VARIANTS = ["a", "b", "c"] as const;

export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAME: Readonly<Record<Variant, string>> = {
  a: "Canonical light",
  b: "Graphite console",
  c: "Hybrid executive",
};

export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}
