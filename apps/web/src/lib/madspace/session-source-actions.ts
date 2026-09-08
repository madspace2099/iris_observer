"use server";

import { revalidatePath } from "next/cache";

import { currentViewer } from "@/lib/session";
import { liveSessionSourceService } from "@/lib/connectors/live";
import type { SessionSourceService } from "@/lib/connectors/session-source-service";
import { isShowroomSourceKind } from "@/lib/connectors/session-source-configs";
import { readModelProjectIdFor } from "@/lib/repository";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

/**
 * THE MADSPACE INTEGRATIONS SCREEN'S SHOWROOM-TELEMETRY WRITES — the mirror
 * of `connector-actions.ts`, kept separate because a showroom-telemetry
 * source is a different kind (`session-source-service.ts` says why) and its
 * form posts a different shape: one fixed URL, one token, no vendor maps.
 *
 * Same discipline as the file it mirrors: every action re-authorises as
 * `madspace_admin`, resolves the project through the control plane before
 * touching it, and returns a sentence rather than a code, a credential or a
 * source response body.
 */

export interface SaveSessionSourceState {
  readonly problem: string | null;
  readonly field: string | null;
  readonly saved: boolean;
}

export interface SessionSyncResult {
  readonly ok: boolean;
  readonly summary: string;
}

type Estate =
  | {
      readonly ok: true;
      readonly service: SessionSourceService;
      readonly readModelProjectId: string | null;
    }
  | { readonly ok: false; readonly problem: string };

async function estate(projectUuid: string): Promise<Estate> {
  const viewer = await currentViewer();
  if (viewer === null) return { ok: false, problem: "Sign in as a MADSPACE administrator first." };
  if (viewer.role !== "madspace_admin") {
    return { ok: false, problem: "Only a MADSPACE administrator may connect a telemetry source." };
  }
  const plane = await controlPlane();
  if (!plane.ok) {
    return {
      ok: false,
      problem:
        plane.absence.kind === "not_enabled"
          ? "This deployment has no control plane configured, so there is nowhere to store a connection. Nothing was saved."
          : "The control plane could not be read. Nothing was saved.",
    };
  }
  const projects = await plane.admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  const row = projects.ok
    ? (projects.value.find((p) => p.project_id === projectUuid) ?? null)
    : null;
  if (row === null) {
    return { ok: false, problem: "That project is not in this estate. Nothing was saved." };
  }
  const service = await liveSessionSourceService();
  if (service === null) {
    return { ok: false, problem: "This server's database predates session-source storage." };
  }
  return { ok: true, service, readModelProjectId: readModelProjectIdFor(row) };
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveSessionSourceAction(
  _previous: SaveSessionSourceState,
  form: FormData,
): Promise<SaveSessionSourceState> {
  const projectUuid = text(form, "project");
  const kind = text(form, "kind");
  if (!isShowroomSourceKind(kind)) {
    return { problem: "Unknown telemetry source kind.", field: null, saved: false };
  }

  const found = await estate(projectUuid);
  if (!found.ok) return { problem: found.problem, field: null, saved: false };

  const url = text(form, "url");
  const token = text(form, "token");

  const result = await found.service.save(
    projectUuid,
    kind,
    { url },
    token.length === 0 ? null : { token },
    form.get("enabled") === "on",
  );
  if (!result.ok) return { problem: result.problem, field: result.field ?? null, saved: false };

  revalidatePath(`/madspace/projects/${projectUuid}/integrations`);
  return { problem: null, field: null, saved: true };
}

export async function syncSessionSourceAction(
  projectUuid: string,
  kind: string,
): Promise<SessionSyncResult> {
  if (!isShowroomSourceKind(kind)) return { ok: false, summary: "Unknown telemetry source kind." };
  const found = await estate(projectUuid);
  if (!found.ok) return { ok: false, summary: found.problem };
  if (found.readModelProjectId === null) {
    return {
      ok: false,
      summary:
        "This control-plane project has no matching Observer project yet, so a sync would have nothing to attach sessions to. Nothing was fetched.",
    };
  }

  const result = await found.service.sync(projectUuid, kind, found.readModelProjectId);
  revalidatePath(`/madspace/projects/${projectUuid}/integrations`);
  if (!result.ok) return { ok: false, summary: result.problem };

  const outcome = result.outcome;
  if (!outcome.ok) {
    const wait =
      outcome.retryAfterSeconds === null
        ? ""
        : ` Try again in ${String(outcome.retryAfterSeconds)} seconds.`;
    return { ok: false, summary: `${outcome.detail}${wait}` };
  }
  return {
    ok: true,
    summary: `Fetched ${String(outcome.fetched)} sessions: ${String(outcome.accepted.length)} accepted, ${String(outcome.rejected)} rejected as unsupported.`,
  };
}

export async function removeSessionSourceCredentialAction(
  projectUuid: string,
  kind: string,
): Promise<{ readonly ok: boolean; readonly problem?: string }> {
  if (!isShowroomSourceKind(kind)) return { ok: false, problem: "Unknown telemetry source kind." };
  const found = await estate(projectUuid);
  if (!found.ok) return { ok: false, problem: found.problem };
  const removed = await found.service.removeCredential(projectUuid, kind);
  revalidatePath(`/madspace/projects/${projectUuid}/integrations`);
  return removed ? { ok: true } : { ok: false, problem: "There was no credential to forget." };
}
