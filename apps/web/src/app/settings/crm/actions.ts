"use server";

import { revalidatePath } from "next/cache";

import type { ConnectorKind } from "@observer/contracts";

import { companyOf, mayConnectCrm } from "@/lib/accounts";
import { currentAccount, currentViewer } from "@/lib/session";
import { repository } from "@/lib/repository";
import { controlPlaneProjectFor } from "@/lib/directory/rows";
import { liveConnectorService } from "@/lib/connectors/live";
import { parseMapLines } from "@/lib/connectors/configs";
import type { ConnectorService } from "@/lib/connectors/service";

/**
 * A COMPANY ADMIN CONNECTS THE COMPANY'S CRM (ADR-0049, ADR-0043).
 *
 * The same connector service the MADSPACE integrations screen writes through
 * (`liveConnectorService`): settings validated by the connector's own schema,
 * a credential sealed under the server's key, a sync recorded. What differs is
 * who may: the signed-in account's company admin, for a project their account
 * holds (`resolveProject` proves the grant) whose developer is their own company
 * (`mayConnectCrm`: an agency holding the project reads it), that stands on the
 * control plane (`controlPlaneProjectFor`). A member reads the page and changes
 * nothing.
 *
 * Every action re-authorises, because a server action is an HTTP endpoint. A
 * credential is read from the form, handed to `save`, and dropped: it is never
 * logged, never returned and never put in a URL. What comes back is a sentence.
 */

export interface CrmActionState {
  /** Null before the first submit. */
  readonly ok: boolean | null;
  readonly message: string | null;
}

type Scope =
  | { readonly ok: true; readonly service: ConnectorService; readonly projectUuid: string }
  | { readonly ok: false; readonly message: string };

const PAGE = "/settings/crm";

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** A secret as typed: never trimmed, since a space can be part of a password. */
function secret(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function whole(form: FormData, key: string): number | null {
  const value = text(form, key);
  return /^\d+$/.test(value) ? Number(value) : null;
}

const refused = (message: string): CrmActionState => ({ ok: false, message });

async function scope(form: FormData): Promise<Scope> {
  const account = await currentAccount();
  const viewer = await currentViewer();
  if (account === null || viewer === null) return { ok: false, message: "Sign in first." };
  const company = companyOf(account);
  if (company.role !== "admin") {
    return {
      ok: false,
      message: `Only ${company.adminName}, the admin of ${company.name}, can connect a CRM. Nothing was saved.`,
    };
  }
  let resolved;
  try {
    resolved = await repository.resolveProject(viewer, text(form, "tenant"), text(form, "project"));
  } catch {
    return { ok: false, message: "That project is not one your account holds. Nothing was saved." };
  }
  if (!mayConnectCrm(account, viewer, resolved.tenant)) {
    return {
      ok: false,
      message: `This project's CRM belongs to ${resolved.tenant.name}, and only its admin connects it. Nothing was saved.`,
    };
  }
  const projectUuid = await controlPlaneProjectFor(resolved.project);
  if (projectUuid === null) {
    return {
      ok: false,
      message:
        "This project has no CRM connection on this server's control plane, so nothing could be saved.",
    };
  }
  const service = await liveConnectorService();
  if (service === null) {
    return {
      ok: false,
      message: "The catalogue store is unavailable on this server. Nothing was saved.",
    };
  }
  return { ok: true, service, projectUuid };
}

/**
 * What is stored for the connector now, so a save here never drops a setting
 * this page does not show. The maps it does show (columns, status and stage
 * words) are drawn filled with what is stored, so a form sent back as drawn
 * keeps them too.
 */
async function stored(
  service: ConnectorService,
  projectUuid: string,
  kind: ConnectorKind,
): Promise<Record<string, unknown>> {
  return (await service.list(projectUuid)).find((c) => c.kind === kind)?.config ?? {};
}

function counted(changes: readonly { readonly kind: string }[], kind: string): number {
  return changes.filter((c) => c.kind === kind).length;
}

/** The unmapped status words a read met, as a sentence; empty when there were none. */
function unmapped(words: readonly string[]): string {
  return words.length === 0
    ? ""
    : ` ${String(words.length)} status word(s) are not mapped yet: ${words.join(", ")}. Until they are, those flats read as unknown and none of them is dated as a sale.`;
}

/** Saves (the write is the caller's), then reads once, and says what happened in one sentence. */
async function saveAndRead(
  found: Extract<Scope, { ok: true }>,
  kind: Exclude<ConnectorKind, "csv">,
  saving: Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: string }>,
): Promise<CrmActionState> {
  const saved = await saving;
  if (!saved.ok) return refused(saved.problem);
  const result = await found.service.sync(found.projectUuid, kind);
  revalidatePath(PAGE);
  if (!result.ok) return refused(`Saved, but not read: ${result.problem}`);
  const outcome = result.outcome;
  if (!outcome.ok) {
    const wait =
      outcome.retryAfterSeconds === null
        ? ""
        : ` Try again in ${String(outcome.retryAfterSeconds)} seconds.`;
    return refused(`Saved, but the read was refused: ${outcome.detail}${wait}`);
  }
  return {
    ok: true,
    message: `Connected. Read ${String(outcome.fetched)} flats: ${String(counted(outcome.changes, "added"))} added, ${String(counted(outcome.changes, "changed"))} changed, ${String(counted(outcome.changes, "withdrawn"))} withdrawn.${unmapped(outcome.unknownStatuses)}`,
  };
}

export async function connectRealpad(
  _previous: CrmActionState,
  form: FormData,
): Promise<CrmActionState> {
  const found = await scope(form);
  if (!found.ok) return refused(found.message);
  const login = text(form, "login");
  const password = secret(form, "password");
  const config = {
    ...(await stored(found.service, found.projectUuid, "realpad")),
    developerId: whole(form, "developerId"),
    projectId: whole(form, "realpadProjectId"),
    screenId: whole(form, "screenId"),
  };
  /*
   * Both empty keeps the stored pair; one without the other is refused by the
   * schema. A new pair keeps a Data Takeout pair MADSPACE stored beside it.
   */
  return saveAndRead(
    found,
    "realpad",
    login === "" && password === ""
      ? found.service.save(found.projectUuid, "realpad", config, null, true)
      : found.service.saveRealpadPricelist(found.projectUuid, config, { login, password }, true),
  );
}

export async function connectMonday(
  _previous: CrmActionState,
  form: FormData,
): Promise<CrmActionState> {
  const found = await scope(form);
  if (!found.ok) return refused(found.message);
  const token = secret(form, "token").trim();
  const config = {
    ...(await stored(found.service, found.projectUuid, "monday")),
    boardId: text(form, "boardId"),
    columns: parseMapLines(text(form, "columns")),
    statusMap: parseMapLines(text(form, "statusMap")),
  };
  return saveAndRead(
    found,
    "monday",
    found.service.save(found.projectUuid, "monday", config, token === "" ? null : { token }, true),
  );
}

async function sheet(form: FormData): Promise<string | CrmActionState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return refused("Choose a CSV file to upload.");
  if (file.size > 5 * 1024 * 1024) return refused("The file is larger than 5 MB.");
  return file.text();
}

export async function uploadFlatsCsv(
  _previous: CrmActionState,
  form: FormData,
): Promise<CrmActionState> {
  const found = await scope(form);
  if (!found.ok) return refused(found.message);
  const body = await sheet(form);
  if (typeof body !== "string") return body;
  const saved = await found.service.save(
    found.projectUuid,
    "csv",
    {
      ...(await stored(found.service, found.projectUuid, "csv")),
      columns: parseMapLines(text(form, "columns")),
      statusMap: parseMapLines(text(form, "statusMap")),
    },
    null,
    true,
  );
  if (!saved.ok) return refused(saved.problem);
  const result = await found.service.importCsv(found.projectUuid, body);
  revalidatePath(PAGE);
  if (!result.ok) return refused(result.problem);
  const outcome = result.outcome;
  if (!outcome.ok) return refused(outcome.detail);
  return {
    ok: true,
    message: `Read ${String(outcome.fetched)} flats: ${String(counted(outcome.changes, "added"))} added, ${String(counted(outcome.changes, "changed"))} changed, ${String(counted(outcome.changes, "withdrawn"))} withdrawn.${unmapped(outcome.unknownStatuses)}${
      result.rejected.length === 0
        ? ""
        : ` ${String(result.rejected.length)} row(s) could not be read.`
    }`,
  };
}

export async function uploadDealsCsv(
  _previous: CrmActionState,
  form: FormData,
): Promise<CrmActionState> {
  const found = await scope(form);
  if (!found.ok) return refused(found.message);
  const base = await stored(found.service, found.projectUuid, "csv");
  if (base["columns"] === undefined) {
    return refused("Upload the flats sheet first: a deal is read against the flats it names.");
  }
  const body = await sheet(form);
  if (typeof body !== "string") return body;
  const dealColumns = parseMapLines(text(form, "dealColumns"));
  const saved = await found.service.save(
    found.projectUuid,
    "csv",
    {
      ...base,
      dealColumns: Object.keys(dealColumns).length === 0 ? null : dealColumns,
      stageMap: parseMapLines(text(form, "stageMap")),
    },
    null,
    true,
  );
  if (!saved.ok) return refused(saved.problem);
  const result = await found.service.importDealsCsv(found.projectUuid, body);
  revalidatePath(PAGE);
  if (!result.ok) return refused(result.problem);
  const outcome = result.outcome;
  if (!outcome.ok) return refused(outcome.detail);
  return {
    ok: true,
    message: `Read ${String(outcome.fetched)} deals: ${String(counted(outcome.changes, "opened"))} new, ${String(counted(outcome.changes, "stage_changed"))} changed stage.${
      outcome.unmappedStages.length === 0
        ? ""
        : ` ${String(outcome.unmappedStages.length)} stage word(s) are not mapped yet: ${outcome.unmappedStages.join(", ")}.`
    }${result.rejected.length === 0 ? "" : ` ${String(result.rejected.length)} row(s) could not be read.`}`,
  };
}

export async function switchOff(
  _previous: CrmActionState,
  form: FormData,
): Promise<CrmActionState> {
  const found = await scope(form);
  if (!found.ok) return refused(found.message);
  const kind = text(form, "connector");
  if (kind !== "realpad" && kind !== "monday" && kind !== "csv") return refused("Unknown CRM.");
  const saved = await found.service.save(
    found.projectUuid,
    kind,
    await stored(found.service, found.projectUuid, kind),
    null,
    false,
  );
  revalidatePath(PAGE);
  return saved.ok
    ? { ok: true, message: "Switched off. Nothing more is read; what was read is kept." }
    : refused(saved.problem);
}
