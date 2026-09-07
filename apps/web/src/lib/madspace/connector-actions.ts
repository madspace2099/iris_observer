"use server";

import { revalidatePath } from "next/cache";

import type { ConnectorKind } from "@observer/contracts";

import { currentViewer } from "@/lib/session";
import { isConnectorKind, parseMapLines } from "@/lib/connectors/configs";
import { liveConnectorService } from "@/lib/connectors/live";
import type { ConnectorService } from "@/lib/connectors/service";
import { CONTROL_PLANE_ACCOUNT, controlPlane } from "@/lib/sources/control-plane";

/**
 * THE INTEGRATIONS SCREEN'S WRITES.
 *
 * Save a connector's settings and, when pasted, its credential; run one sync
 * now; upload a spreadsheet; forget a credential. Every action re-authorises
 * — a server action is an HTTP endpoint — and every one resolves the project
 * through the control plane before touching it, so a crafted request cannot
 * name a project this estate does not hold.
 *
 * Nothing here returns a credential, a config secret or a CRM response body.
 * A refusal is a sentence naming what the operator can do next.
 */

export interface SaveConnectorState {
  readonly problem: string | null;
  readonly field: string | null;
  readonly saved: boolean;
}

export interface ImportState {
  readonly problem: string | null;
  readonly summary: string | null;
  readonly rejected: readonly string[];
}

export interface SyncResult {
  readonly ok: boolean;
  readonly summary: string;
}

type Estate =
  | { readonly ok: true; readonly service: ConnectorService }
  | { readonly ok: false; readonly problem: string };

async function estate(projectUuid: string): Promise<Estate> {
  const viewer = await currentViewer();
  if (viewer === null) return { ok: false, problem: "Sign in as a MADSPACE administrator first." };
  if (viewer.role !== "madspace_admin") {
    return { ok: false, problem: "Only a MADSPACE administrator may connect a CRM." };
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
  if (!projects.ok || !projects.value.some((p) => p.project_id === projectUuid)) {
    return { ok: false, problem: "That project is not in this estate. Nothing was saved." };
  }
  const service = await liveConnectorService();
  if (service === null) return { ok: false, problem: "The catalogue store is unavailable." };
  return { ok: true, service };
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(form: FormData, key: string): string | null {
  const value = text(form, key);
  return value.length === 0 ? null : value;
}

function integer(form: FormData, key: string): number | null {
  const value = text(form, key);
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

function configFrom(
  kind: ConnectorKind,
  form: FormData,
  maps: { columns: Record<string, string>; statusMap: Record<string, string> },
): unknown {
  const currency = optional(form, "currency");
  switch (kind) {
    case "realpad":
      return {
        developerId: integer(form, "developerId"),
        projectId: integer(form, "realpadProjectId"),
        screenId: integer(form, "screenId"),
        includeHidden: form.get("includeHidden") === "on",
        currency,
      };
    case "lomnio":
      return { statusMap: maps.statusMap, currency };
    case "monday":
      return {
        boardId: text(form, "boardId"),
        columns: maps.columns,
        statusMap: maps.statusMap,
        currency,
      };
    case "csv":
      return { columns: maps.columns, statusMap: maps.statusMap, currency };
  }
}

function credentialFrom(kind: ConnectorKind, form: FormData): unknown | null {
  switch (kind) {
    case "realpad": {
      const login = text(form, "login");
      const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
      return login.length === 0 && password.length === 0 ? null : { login, password };
    }
    case "lomnio": {
      const token = text(form, "token");
      return token.length === 0 ? null : { token, signingSecret: optional(form, "signingSecret") };
    }
    case "monday": {
      const token = text(form, "token");
      return token.length === 0 ? null : { token };
    }
    case "csv":
      return null;
  }
}

export async function saveConnectorAction(
  _previous: SaveConnectorState,
  form: FormData,
): Promise<SaveConnectorState> {
  const projectUuid = text(form, "project");
  const kind = text(form, "connector");
  if (!isConnectorKind(kind)) return { problem: "Unknown connector.", field: null, saved: false };

  const found = await estate(projectUuid);
  if (!found.ok) return { problem: found.problem, field: null, saved: false };

  const maps = {
    columns: parseMapLines(text(form, "columns")),
    statusMap: parseMapLines(text(form, "statusMap")),
  };
  const result = await found.service.save(
    projectUuid,
    kind,
    configFrom(kind, form, maps),
    credentialFrom(kind, form),
    form.get("enabled") === "on",
  );
  if (!result.ok) return { problem: result.problem, field: result.field ?? null, saved: false };

  revalidatePath(`/madspace/projects/${projectUuid}/integrations`);
  return { problem: null, field: null, saved: true };
}

export async function syncConnectorAction(projectUuid: string, kind: string): Promise<SyncResult> {
  if (!isConnectorKind(kind)) return { ok: false, summary: "Unknown connector." };
  const found = await estate(projectUuid);
  if (!found.ok) return { ok: false, summary: found.problem };

  const result = await found.service.sync(projectUuid, kind);
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
  const added = outcome.changes.filter((c) => c.kind === "added").length;
  const changed = outcome.changes.filter((c) => c.kind === "changed").length;
  const withdrawn = outcome.changes.filter((c) => c.kind === "withdrawn").length;
  const unknown =
    outcome.unknownStatuses.length === 0
      ? ""
      : ` ${String(outcome.unknownStatuses.length)} status word(s) are not mapped yet: ${outcome.unknownStatuses.join(", ")}.`;
  return {
    ok: true,
    summary: `Fetched ${String(outcome.fetched)} units: ${String(added)} added, ${String(changed)} changed, ${String(withdrawn)} withdrawn.${unknown}`,
  };
}

export async function importCsvAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  const projectUuid = text(form, "project");
  const found = await estate(projectUuid);
  if (!found.ok) return { problem: found.problem, summary: null, rejected: [] };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { problem: "Choose a CSV file to upload.", summary: null, rejected: [] };
  }
  if (file.size > 5 * 1024 * 1024) {
    return {
      problem: "The file is larger than 5 MB. Export the pricelist alone.",
      summary: null,
      rejected: [],
    };
  }

  const result = await found.service.importCsv(projectUuid, await file.text());
  revalidatePath(`/madspace/projects/${projectUuid}/integrations`);
  if (!result.ok) return { problem: result.problem, summary: null, rejected: [] };
  const outcome = result.outcome;
  if (!outcome.ok) return { problem: outcome.detail, summary: null, rejected: [] };

  const added = outcome.changes.filter((c) => c.kind === "added").length;
  const changed = outcome.changes.filter((c) => c.kind === "changed").length;
  const withdrawn = outcome.changes.filter((c) => c.kind === "withdrawn").length;
  const unknown =
    outcome.unknownStatuses.length === 0
      ? ""
      : ` ${String(outcome.unknownStatuses.length)} status word(s) are not mapped yet and were recorded as unknown: ${outcome.unknownStatuses.join(", ")}.`;
  return {
    problem: null,
    summary: `Read ${String(outcome.fetched)} units: ${String(added)} added, ${String(changed)} changed, ${String(withdrawn)} withdrawn.${unknown}`,
    rejected: result.rejected.map((r) => `Row ${String(r.line)}: ${r.reason}.`),
  };
}

export async function removeCredentialAction(
  projectUuid: string,
  kind: string,
): Promise<{ readonly ok: boolean; readonly problem?: string }> {
  if (!isConnectorKind(kind)) return { ok: false, problem: "Unknown connector." };
  const found = await estate(projectUuid);
  if (!found.ok) return { ok: false, problem: found.problem };
  const removed = await found.service.removeCredential(projectUuid, kind);
  revalidatePath(`/madspace/projects/${projectUuid}/integrations`);
  return removed ? { ok: true } : { ok: false, problem: "There was no credential to forget." };
}
