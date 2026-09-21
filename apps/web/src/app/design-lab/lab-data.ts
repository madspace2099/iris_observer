import "server-only";

import { notFound } from "next/navigation";

import { credentialWord, installationAnswer, type InstallationAnswer } from "@/lib/madspace/format";
import { locateSource, projectSummaries, type ProjectSummary } from "@/lib/madspace/estate";
import {
  diagnosticsEstate,
  quarantineActivity,
  queuePressure,
  queueUnmeasured,
  recentErrorCodes,
  recentHeartbeats,
  recentVerifications,
  requiringAttention,
  type DiagnosticSource,
} from "@/lib/madspace/diagnostics";
import {
  CONTROL_PLANE_ACCOUNT,
  CONTROL_PLANE_ACCOUNT_NAME,
  controlPlane,
  sourceViews,
  HEALTH_LABEL,
  HEALTH_TONE,
  runningLocally,
  type SourceView,
} from "@/lib/sources/control-plane";
import { demonstrationEstate } from "@/lib/sources/seed";
import { localControlPlaneEnabled } from "@/lib/sources/local-db";
import type { CredentialStatusRow } from "@observer/sources";
import type { MarkTone } from "@/components/madspace/StatusMark";

/**
 * ONE READ, EVERY SCREEN, EVERY VARIANT.
 *
 * The lab exists to choose a visual direction, and that choice only means
 * something if the candidates are looking at identical facts. So there is one
 * loader, it runs the SAME path the live screens use, and every screen in every
 * variant receives the whole bundle and takes what it needs.
 *
 * Loading everything at once rather than per screen is deliberate. The
 * demonstration estate is one project and one source, so the cost is nothing,
 * and it removes the only way three variants of one screen could ever disagree:
 * three separate reads taken at three separate moments.
 *
 * ## What is NOT here
 *
 * No second read model, no fixture, no per-variant shaping. Nothing in this file
 * decides what a state means, what a verdict is called or how an absent value
 * reads; `control-plane.ts`, `diagnostics.ts` and `format.ts` decide all of
 * that, and the live screens get it from the same place. A variant that wanted
 * a figure this does not return would be a variant asking to show something the
 * product does not know, and the answer to that is no rather than a prop.
 */

export interface LabSource {
  readonly view: SourceView;
  readonly credential: CredentialStatusRow | null;
  readonly answer: InstallationAnswer;
  readonly healthLabel: string;
  readonly healthTone: MarkTone;
  readonly projectName: string | null;
  readonly credentialLabel: string;
  readonly now: Date;
}

/** The diagnostics screen's six sections, already selected and ordered. */
export interface LabDiagnostics {
  readonly total: number;
  readonly attention: readonly DiagnosticSource[];
  readonly heartbeats: readonly DiagnosticSource[];
  readonly verifications: readonly DiagnosticSource[];
  readonly pressure: readonly DiagnosticSource[];
  readonly unmeasured: number;
  readonly quarantines: readonly DiagnosticSource[];
  readonly errors: readonly DiagnosticSource[];
}

/**
 * The activation panel's state.
 *
 * `code` is the one value in the whole lab that is not read from the database,
 * and it cannot be: the plaintext exists on the server for the length of one
 * return statement and is never stored, which is the entire point of the
 * design. So it is a correctly SHAPED sample, marked as one, and every variant
 * has to label it. Everything else here is the real credential row.
 */
export interface LabActivation {
  readonly credential: CredentialStatusRow | null;
  readonly state: string;
  readonly tone: MarkTone;
  readonly sampleCode: string;
  readonly isSample: true;
}

/**
 * One source anywhere in the account, with the name of the project holding it.
 *
 * The Sources list is the only screen whose subject is the whole account's
 * installations rather than one project's or one machine's, so it is the only
 * one that needs the project name travelling beside the row: without it every
 * row would name a machine and none would say where it stands.
 *
 * `projectName` is nullable for the reason `DiagnosticSource` gives — a screen
 * that silently prints a uuid where a name should be teaches the reader that
 * the two are interchangeable.
 */
export interface EstateSource {
  readonly view: SourceView;
  readonly projectName: string | null;
}

export interface LabEstate {
  readonly accountName: string;
  readonly local: boolean;
  readonly projects: readonly ProjectSummary[];
  readonly project: ProjectSummary | null;
  /** Every source under the demonstration project, for Project detail. */
  readonly sources: readonly SourceView[];
  /** Every source in the account, for the Sources list. */
  readonly estate: readonly EstateSource[];
  readonly source: LabSource;
  readonly diagnostics: LabDiagnostics;
  readonly activation: LabActivation;
  readonly now: Date;
}

/**
 * A code shaped exactly like a real one, and obviously not one.
 *
 * `obs.<selector>.<secret>`, the format `secrets.ts` mints. The body spells out
 * what it is rather than looking like entropy, because a sample that looks real
 * is a sample somebody eventually tries to use.
 */
const SAMPLE_CODE = "obs.SAMPLEonlyNOTaREALcode.thisVALUEisDRAWNforREVIEWandGRANTSnothing";

const CREDENTIAL_TONE: Readonly<Record<string, MarkTone>> = {
  active: "good",
  revoked: "operator",
  superseded: "none",
  expired: "wrong",
};

/**
 * The estate, read as the live screens read it.
 *
 * `notFound()` rather than a friendly empty state on every failure. This route
 * is a development instrument, and a lab that renders a placeholder when the
 * data is missing is a lab that can show a layout for facts that are not there.
 * If it cannot read the estate it should draw nothing at all.
 */
export async function labEstate(): Promise<LabEstate> {
  if (!localControlPlaneEnabled()) notFound();

  const plane = await controlPlane();
  if (!plane.ok) notFound();

  const estate = await demonstrationEstate(plane.admin);
  if (estate === null) notFound();

  const located = await locateSource(plane.admin, estate.sourceId);
  if (located === null) notFound();

  const now = new Date();
  const sources = await sourceViews(plane.admin, located.project_id, now);
  const view = sources.find((candidate) => candidate.status.source_id === estate.sourceId);
  if (view === undefined) notFound();

  const credentialResult = await plane.admin.credentialStatus({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
  });
  const credential = credentialResult.ok ? credentialResult.value : null;

  const projects = await projectSummaries(plane.admin);
  const project = projects.find((row) => row.projectId === view.status.project_id) ?? null;

  /*
   * The whole account's sources, through `sourceViews` once per project.
   *
   * There is no account-wide variant of that function and this deliberately
   * does not add one: `sourceViews` is what the live screens read, and it is
   * what carries ACTIVATION — the one of the three states that cannot be
   * derived from the operations row, because it comes from the credential.
   * `diagnosticsEstate` reads the account in a single query and would have been
   * cheaper, but it never reads credentials, so a Sources list built on it
   * could only have shown two of the three states honestly and would have had
   * to infer the third. Four extra round trips on a development instrument is
   * the correct price for not inferring it.
   */
  const estateSources = (
    await Promise.all(
      projects.map(async (summary) => {
        const rows = await sourceViews(plane.admin, summary.projectId, now);
        return rows.map((row) => ({ view: row, projectName: summary.name }));
      }),
    )
  ).flat();

  /*
   * Read with an empty filter. Diagnostics has a real filter control and this
   * lab is not prototyping it: the point is what the screen looks like holding
   * a whole account, and a filtered read would quietly narrow what the three
   * variants are being judged on.
   */
  const diagnostics = await diagnosticsEstate(
    plane.admin,
    { project: null, environment: null, health: null },
    now,
  );

  const credentialState = credential?.state ?? "";

  return {
    accountName: CONTROL_PLANE_ACCOUNT_NAME,
    local: runningLocally(),
    projects,
    project,
    sources,
    estate: estateSources,
    source: {
      view,
      credential,
      answer: installationAnswer(view, now),
      healthLabel: HEALTH_LABEL[view.health],
      healthTone: HEALTH_TONE[view.health],
      projectName: project?.name ?? null,
      credentialLabel: credentialWord(credentialState).word,
      now,
    },
    diagnostics: {
      total: diagnostics.all.length,
      attention: requiringAttention(diagnostics),
      heartbeats: recentHeartbeats(diagnostics),
      verifications: recentVerifications(diagnostics),
      pressure: queuePressure(diagnostics),
      unmeasured: queueUnmeasured(diagnostics),
      quarantines: quarantineActivity(diagnostics),
      errors: recentErrorCodes(diagnostics),
    },
    activation: {
      credential,
      state: credentialWord(credentialState).word,
      tone: CREDENTIAL_TONE[credentialState] ?? "none",
      sampleCode: SAMPLE_CODE,
      isSample: true,
    },
    now,
  };
}

/* --- the registry -------------------------------------------------------------- */

export const VARIANTS = ["a", "b", "c"] as const;
export type Variant = (typeof VARIANTS)[number];

export const VARIANT_NAME: Readonly<Record<Variant, string>> = {
  a: "Canonical light",
  b: "Graphite console",
  c: "Hybrid executive",
};

export const SCREENS = [
  "projects",
  "sources",
  "project-detail",
  "source-detail",
  "activation",
  "diagnostics",
] as const;

export type Screen = (typeof SCREENS)[number];

export const SCREEN_NAME: Readonly<Record<Screen, string>> = {
  projects: "Projects",
  sources: "Sources",
  "project-detail": "Project detail",
  "source-detail": "Source detail",
  activation: "Activation and source actions",
  diagnostics: "Diagnostics",
};

export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}

export function isScreen(value: string): value is Screen {
  return (SCREENS as readonly string[]).includes(value);
}

/** Every screen takes the whole estate. One prop, so no screen can drift. */
export interface LabScreenProps {
  readonly estate: LabEstate;
  readonly screenName: string;
  readonly variantName: string;
}
