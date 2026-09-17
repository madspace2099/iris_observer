"use server";

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { platform, release } from "node:os";
import { join } from "node:path";

import {
  ActivationSuccessSchema,
  BatchResponseSchema,
  HeartbeatResponseSchema,
  OBSERVER_ROUTES,
  RequestFailureBodySchema,
  ActivationFailureSchema,
  DIAGNOSTIC_TEST_EVENT,
} from "@observer/contracts/ue5";
import {
  ACTIVATION_CODE_PEPPER,
  SOURCE_TOKEN_PEPPER,
  describePepper,
  type ObserverAdmin,
} from "@observer/sources";
import type { Viewer } from "@observer/readmodels";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { liveConnectorService } from "@/lib/connectors/live";
import { forgetSessionMemo } from "@/lib/connectors/session-source";
import { repository } from "@/lib/repository";
import { currentViewer } from "@/lib/session";

import { CONTROL_PLANE_ACCOUNT, controlPlane } from "./control-plane";
import { observerLocalDirectory } from "./local-db";
import { DEMONSTRATION_PROJECT_SLUG, DEMONSTRATION_SOURCE_TYPE, demonstrationEstate } from "./seed";

/**
 * WALKING THE SOURCE LIFECYCLE, THROUGH THE REAL PATH AND NOTHING ELSE.
 *
 * Five states — created, activated, connected, ingestion verified, suspended —
 * and an operator presses through them one at a time. Every press below does
 * the thing a real installation does:
 *
 *   - issuing a code calls `ObserverAdmin.issueActivationCode`, the same
 *     function an administration screen will call;
 *   - activating **POSTs to `/functions/v1/observer-activate` over HTTP**, on
 *     this same server, exactly as the UE5 plugin does;
 *   - heartbeat and diagnostic POST to the URLs *activation handed back*, with
 *     the source token in an `Authorization: Bearer` header;
 *   - suspend and resume call the admin services.
 *
 * The demonstration path and the production path are therefore the same path.
 * There is no shortcut that writes a status column directly, and there is
 * deliberately nowhere one could be added: this file holds no database handle
 * except the admin service, and the two liveness states can only be reached by
 * a request that authenticates.
 *
 * ## The source token never reaches the browser
 *
 * Activation mints a long-lived, source-scoped credential and returns its
 * plaintext exactly once. It is written to a file beside the local database and
 * read back from there on every subsequent press. It is never returned from an
 * action, never placed in a cookie, never rendered, and never logged — the only
 * secret this file returns is the activation code, which is single-use, expires
 * in fifteen minutes and is the one value an operator genuinely has to see.
 *
 * The file lives under `.observer-local/` for the same reason the database
 * does: it is state belonging to one developer's machine, it is gitignored, and
 * deleting that directory resets the demonstration completely. A credential
 * whose lifetime outlived the database that issued it would be a token pointing
 * at nothing, and worse, a token nobody remembered was there.
 *
 * ## Every action re-authorises
 *
 * A server action is an HTTP endpoint. These issue credentials and change
 * source state, so each one checks the viewer's role first; the account is
 * never a parameter. See `settings/ai/actions.ts`, which makes the same
 * argument at greater length.
 */

/* --- what the harness says about itself ------------------------------------------- */

/**
 * WHAT IS ACTUALLY SPEAKING, named honestly.
 *
 * These strings land on the operations screens as `observed_plugin`,
 * `observed_app_version`, `observed_build_id` and `observed_engine`. The
 * temptation is to fill them with a plausible showroom PC — `IRIS 2.4.1`,
 * `Unreal 5.6` — and that would be fabricated data on a screen whose entire
 * purpose is to report what is really in the field.
 *
 * So they say what they are. A reviewer looking at ISTER TOWER sees that the
 * thing which activated is this review harness, not a showroom, and there is no
 * moment where the estate looks more real than it is.
 */
const HARNESS_BUILD = {
  app_version: "iris-observer-review",
  plugin_version: "observer-review-harness",
  /* A true description of where this build came from, not a version number nobody minted. */
  build_id: "local-development",
  /* There is no Unreal here. Saying so beats inventing an engine minor. */
  engine_version: "not-unreal",
} as const;

/**
 * The environment this harness BELIEVES it is in, which is not the source's.
 *
 * The source is registered as `production` because that is what a showroom PC
 * is; this process is a development server and says so. The difference is
 * reported to activation and ingestion as `reported_environment` /
 * `app.environment`, and the backend derives `environment_mismatch` from it.
 *
 * That flag will therefore be TRUE on the demonstration estate, and it is not a
 * defect to be silenced: it is the reported-versus-authoritative split working,
 * and a screen showing it is showing something true. Reporting `production`
 * from a development server to make the row look tidy would be the one thing
 * this repository refuses — a value on screen that nothing measured.
 */
const REPORTED_ENVIRONMENT = process.env.NODE_ENV === "production" ? "production" : "development";

/**
 * The outbox this harness has, measured rather than imagined.
 *
 * Zero pending and zero quarantined because there is no outbox at all: these
 * actions send synchronously and a press either succeeds or reports why. That
 * makes zero a fact about the sender.
 *
 * `bytes_ceiling` is null, and that is the one number that must not be zero. No
 * ceiling is configured, and `queueFill` renders a null ceiling as "no
 * measurement" while a zero would render as a confident 0% — an absent value
 * dressed as a reading, which is exactly what the doctrine forbids.
 */
const HARNESS_QUEUE = {
  pending_events: 0,
  oldest_pending_at: null,
  quarantined_events: 0,
  bytes_used: 0,
  bytes_ceiling: null,
  dropped_events: 0,
} as const;

/* --- results the screens render ----------------------------------------------------- */

/**
 * Every action answers with the same two shapes.
 *
 * `problem` is a sentence for a reader, never a code, and never a stack: these
 * run beside a button and the answer has to be legible where it lands. Nothing
 * branches on it, so nothing breaks when the wording improves.
 */
interface Refused {
  readonly ok: false;
  readonly problem: string;
}

const refuse = (problem: string): Refused => ({ ok: false, problem });

/* --- the installation record -------------------------------------------------------- */

const INSTALLATION_FILE = "demonstration-installation.json";

/**
 * What this harness keeps between presses.
 *
 * `installation_nonce` is minted once and persisted because that is what the
 * contract asks of a plugin: a value generated once beside the outbox, so the
 * server can tell one installation coming back from a second installation
 * arriving. Regenerating it per request would make every activation look like a
 * new machine.
 *
 * `source_token` is credential material. It is here and in no other place — not
 * in a cookie, not in module state that a hot reload would drop, not in
 * anything a client component can reach.
 */
interface Installation {
  readonly installation_nonce: string;
  readonly source_token: string | null;
  readonly source_id: string | null;
  readonly ingest_url: string | null;
  readonly heartbeat_url: string | null;
}

function installationPath(): string {
  return join(observerLocalDirectory(), INSTALLATION_FILE);
}

function readInstallation(): Installation | null {
  let raw: string;
  try {
    raw = readFileSync(installationPath(), "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const nonce = record["installation_nonce"];
  if (typeof nonce !== "string" || nonce.length === 0) return null;

  const text = (key: string): string | null => {
    const value = record[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  return {
    installation_nonce: nonce,
    source_token: text("source_token"),
    source_id: text("source_id"),
    ingest_url: text("ingest_url"),
    heartbeat_url: text("heartbeat_url"),
  };
}

function writeInstallation(installation: Installation): void {
  mkdirSync(observerLocalDirectory(), { recursive: true });
  /*
   * 0600 because this file holds a live credential. Windows largely ignores the
   * mode, which is why the token's real protection is the directory it sits in
   * — outside the served tree, outside the bundle, and gitignored — rather than
   * a permission bit.
   */
  writeFileSync(installationPath(), `${JSON.stringify(installation, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** The nonce for this installation, minted once and kept. */
function installationNonce(): string {
  const existing = readInstallation();
  if (existing !== null) return existing.installation_nonce;

  const created: Installation = {
    installation_nonce: randomUUID(),
    source_token: null,
    source_id: null,
    ingest_url: null,
    heartbeat_url: null,
  };
  writeInstallation(created);
  return created.installation_nonce;
}

/* --- talking to ourselves over HTTP -------------------------------------------------- */

/**
 * The origin this server is reachable at, for the calls it makes to itself.
 *
 * `OBSERVER_PUBLIC_ORIGIN` when a deployment states one — the same variable
 * `activate.ts` uses to build the URLs it hands clients, so the two cannot
 * disagree — and otherwise the `Host` this very request arrived on. In
 * development that is `localhost:3310` and no configuration is needed.
 *
 * The point of the round trip is that it is a real one. Calling `handleActivate`
 * in process would exercise the handler and skip the route, the runtime
 * declaration and the dependency wiring, which is where a deployment actually
 * breaks.
 */
async function harnessOrigin(): Promise<string> {
  const configured = process.env["OBSERVER_PUBLIC_ORIGIN"];
  if (configured !== undefined && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, "");
  }

  const store = await headers();
  const host = store.get("host");
  if (host === null || host.length === 0) {
    throw new Error(
      "This request carried no Host header, so the demonstration cannot work out which origin " +
        "to call. Set OBSERVER_PUBLIC_ORIGIN.",
    );
  }
  /* A proxy may send a list; the first entry is the scheme the client used. */
  const forwarded = store.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme = forwarded === undefined || forwarded.length === 0 ? "http" : forwarded;
  return `${scheme}://${host}`;
}

/** One JSON POST, with the body already built. Never retried: a press is a press. */
async function postJson(
  url: string,
  body: unknown,
  token: string | null,
): Promise<{ readonly status: number; readonly payload: unknown } | Refused> {
  const requestHeaders: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) requestHeaders["authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error: unknown) {
    return refuse(
      `The request to ${url} could not be made: ${error instanceof Error ? error.message : "the connection failed"}.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return refuse(`${url} answered ${String(response.status)} with a body that is not JSON.`);
  }
  return { status: response.status, payload };
}

/**
 * Whether a step refused, narrowing the success half for the caller.
 *
 * Generic over the success shape rather than declared against a common base,
 * because the successes have nothing in common — one carries an admin service,
 * one a parsed response, one a credential — and inventing a shared `ok: true`
 * on all of them would be a type existing to satisfy a helper rather than to
 * describe anything.
 */
function isRefused<T>(value: T | Refused): value is Refused {
  return typeof value === "object" && value !== null && (value as Refused).ok === false;
}

/**
 * A refusal body, read as the contract publishes it.
 *
 * Parsed rather than cast, so a body that does not match the published shape is
 * reported as that rather than rendered as an empty message — the failure a
 * reviewer would otherwise see as a button that did nothing.
 */
function describeFailure(url: string, status: number, payload: unknown): string {
  const request = RequestFailureBodySchema.safeParse(payload);
  if (request.success) return `${request.data.code}: ${request.data.message}`;

  const activation = ActivationFailureSchema.safeParse(payload);
  if (activation.success) return `${activation.data.code}: ${activation.data.message}`;

  return `${url} answered ${String(status)} with a body this contract does not describe.`;
}

/* --- authorisation ------------------------------------------------------------------- */

/**
 * The estate, or the reason there is not one.
 *
 * Role first, because everything below it either mints a credential or changes
 * a source's state. `currentViewer` rather than `requireViewer`: a redirect is
 * the right answer for a page and a confusing one for a button, which should
 * say why nothing happened.
 */
async function operatorEstate(): Promise<
  | {
      readonly ok: true;
      readonly admin: ObserverAdmin;
      readonly sourceId: string;
      /* The project the source sits in, which the review seeder needs to add siblings to it. */
      readonly projectId: string;
      readonly viewer: Viewer;
    }
  | Refused
> {
  const viewer = await currentViewer();
  if (viewer === null) return refuse("Sign in as a MADSPACE administrator to operate this estate.");
  if (viewer.role !== "madspace_admin") {
    return refuse("Only a MADSPACE administrator may operate the demonstration estate.");
  }

  const plane = await controlPlane();
  if (!plane.ok) {
    return refuse(
      plane.absence.kind === "not_enabled"
        ? "This deployment has no control plane, so there is nothing to operate."
        : `The control plane could not be opened: ${plane.absence.detail}`,
    );
  }

  let estate;
  try {
    estate = await demonstrationEstate(plane.admin);
  } catch (error: unknown) {
    return refuse(
      error instanceof Error ? error.message : "The demonstration estate could not be ensured.",
    );
  }
  if (estate === null) return refuse("The demonstration estate is not present in this database.");

  return {
    ok: true,
    admin: plane.admin,
    sourceId: estate.sourceId,
    projectId: estate.projectId,
    viewer,
  };
}

/**
 * Where the review screens live.
 *
 * Every press changes something a screen is reading — a credential row, a
 * heartbeat timestamp, a lifecycle state — so the surface has to be re-rendered
 * or the operator is looking at the state before their own action. `layout`
 * covers the nested routes under `/madspace`, which is where the operations
 * surface belongs; nothing else in the application reads this estate.
 */
const REVIEW_SURFACE = "/madspace";

/* --- 1. issue a code ------------------------------------------------------------------ */

/**
 * Issue a real activation code and return its plaintext ONCE.
 *
 * The plaintext exists on this server for the length of one return statement
 * and is never written anywhere — `IssuedActivation.toJSON` omits it precisely
 * so the ordinary accident, logging the whole result, cannot leak it. It is
 * returned to the operator because that is what an activation code is for: a
 * human carries it to a machine.
 *
 * The purpose is derived from whether a credential row exists at all, including
 * a revoked or superseded one, because "activated once, revoked, coming back"
 * is a reactivation and the audit trail should say so.
 */
export async function issueCodeAction(): Promise<
  | {
      readonly ok: true;
      readonly code: string;
      readonly selector: string;
      readonly purpose: string;
      readonly expiresAt: string;
    }
  | Refused
> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  /*
   * The peppers, checked before anything is minted, so a development machine
   * that has not set them is told which variable and what is wrong with it.
   * Without this the same misconfiguration arrives as a thrown
   * PepperMisconfiguredError from inside the service and, one step later, as a
   * 503 from activation — two unreadable failures for one missing line in
   * `.env.local`. `describePepper` returns a description, never the value.
   */
  for (const variable of [ACTIVATION_CODE_PEPPER, SOURCE_TOKEN_PEPPER]) {
    const verdict = describePepper(variable, process.env);
    if (!verdict.ok) {
      return refuse(
        `${variable} ${verdict.problem}. No credential can be issued until it holds at least ` +
          "32 bytes of random material.",
      );
    }
  }

  const credential = await estate.admin.credentialStatus({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
  });
  const purpose = credential.ok && credential.value !== null ? "reactivation" : "activation";

  const issued = await estate.admin.issueActivationCode({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
    purpose,
  });
  if (!issued.ok) {
    return refuse(`The activation code could not be issued: ${issued.refusal.code}.`);
  }

  revalidatePath(REVIEW_SURFACE, "layout");
  return {
    ok: true,
    code: issued.value.plaintext,
    selector: issued.value.selector,
    purpose: issued.value.purpose,
    expiresAt: issued.value.expiresAt,
  };
}

/* --- 2. activate ---------------------------------------------------------------------- */

/**
 * Present the code to `/functions/v1/observer-activate`, over HTTP, as a plugin does.
 *
 * The code arrives from the browser because that is the real journey: it was
 * shown to an operator, who carried it to a machine. It is bounded before it is
 * sent — the endpoint would refuse an over-long one anyway, but a value from a
 * client is checked where it enters, not where it lands.
 *
 * What comes back includes the source token. It is written to disk and stripped
 * from the answer; everything else the endpoint states is returned, because all
 * of it is a fact the endpoint just asserted.
 */
export async function activateAction(activationCode: string): Promise<
  | {
      readonly ok: true;
      readonly status: string;
      readonly sourceId: string;
      readonly displayLabel: string;
      readonly environment: string;
      readonly environmentMismatch: boolean;
      readonly ingestUrl: string;
      readonly heartbeatUrl: string;
    }
  | Refused
> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const code = typeof activationCode === "string" ? activationCode.trim() : "";
  if (code.length < 8 || code.length > 128) {
    return refuse("That is not an activation code. Issue one first, then activate.");
  }

  let origin: string;
  try {
    origin = await harnessOrigin();
  } catch (error: unknown) {
    return refuse(error instanceof Error ? error.message : "The origin could not be determined.");
  }

  const url = `${origin}${OBSERVER_ROUTES.activate}`;
  const answer = await postJson(
    url,
    {
      activation_code: code,
      reported_environment: REPORTED_ENVIRONMENT,
      installation_nonce: installationNonce(),
      build: HARNESS_BUILD,
      os: `${platform()} ${release()}`.slice(0, 96),
    },
    null,
  );
  if (isRefused(answer)) return answer;

  const success = ActivationSuccessSchema.safeParse(answer.payload);
  if (!success.success) return refuse(describeFailure(url, answer.status, answer.payload));

  /*
   * The token's one and only landing place. It is taken out of the parsed body
   * immediately and the object below — which is what the browser receives —
   * never holds it.
   */
  writeInstallation({
    installation_nonce: installationNonce(),
    source_token: success.data.source_token,
    source_id: success.data.source_id,
    ingest_url: success.data.ingest_url,
    heartbeat_url: success.data.heartbeat_url,
  });

  revalidatePath(REVIEW_SURFACE, "layout");
  return {
    ok: true,
    status: success.data.status,
    sourceId: success.data.source_id,
    displayLabel: success.data.display_label,
    environment: success.data.environment,
    environmentMismatch: success.data.environment_mismatch,
    ingestUrl: success.data.ingest_url,
    heartbeatUrl: success.data.heartbeat_url,
  };
}

/* --- the credential, read back for the two authenticated presses ---------------------- */

interface Credentialled {
  readonly token: string;
  readonly ingestUrl: string;
  readonly heartbeatUrl: string;
}

function credentialled(): Credentialled | Refused {
  const installation = readInstallation();
  if (
    installation === null ||
    installation.source_token === null ||
    installation.ingest_url === null ||
    installation.heartbeat_url === null
  ) {
    return refuse("This source has not been activated yet, so it holds no credential to send.");
  }
  return {
    token: installation.source_token,
    ingestUrl: installation.ingest_url,
    heartbeatUrl: installation.heartbeat_url,
  };
}

/* --- 3. heartbeat --------------------------------------------------------------------- */

/**
 * Send one real, bounded heartbeat to the URL activation handed back.
 *
 * To the URL activation stated, rather than one rebuilt from the route
 * constant, because using the server's own answer is what the plugin does and
 * is the only version of this call that would notice the two disagreeing.
 *
 * A heartbeat proves CONNECTED and nothing else. It writes to the source's
 * operational record and never to `analytics_events` — which is why proving
 * ingestion needs the next press and cannot be folded into this one.
 */
export async function heartbeatAction(): Promise<
  { readonly ok: true; readonly serverTime: string; readonly configStale: boolean } | Refused
> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const credential = credentialled();
  if (isRefused(credential)) return credential;

  const answer = await postJson(
    credential.heartbeatUrl,
    {
      sent_at: new Date().toISOString(),
      build: HARNESS_BUILD,
      queue: HARNESS_QUEUE,
      last_error: null,
    },
    credential.token,
  );
  if (isRefused(answer)) return answer;

  const parsed = HeartbeatResponseSchema.safeParse(answer.payload);
  if (!parsed.success) {
    return refuse(describeFailure(credential.heartbeatUrl, answer.status, answer.payload));
  }

  revalidatePath(REVIEW_SURFACE, "layout");
  return { ok: true, serverTime: parsed.data.server_time, configStale: parsed.data.config_stale };
}

/* --- 4. prove ingestion ---------------------------------------------------------------- */

/**
 * Send one `diagnostic.test` event through `/functions/v1/observer-ingest`.
 *
 * The reserved diagnostic namespace exists for exactly this: proving that an
 * event can travel the whole path — envelope, validation, insert, idempotency —
 * by sending a real event through the real path, and being permanently excluded
 * from every read model by a published rule rather than by everyone remembering
 * to exclude it.
 *
 * The counts come back from the endpoint and are returned unchanged. A batch of
 * one that is `rejected` is a successful HTTP request and a failed ingestion,
 * and the two are reported separately because the contract keeps them separate:
 * the status says whether the batch was processed, never whether the event was
 * accepted.
 */
export async function diagnosticAction(): Promise<
  | {
      readonly ok: true;
      readonly accepted: number;
      readonly duplicate: number;
      readonly rejected: number;
      readonly outcome: string;
      readonly detail: string | null;
      readonly warnings: readonly string[];
    }
  | Refused
> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const credential = credentialled();
  if (isRefused(credential)) return credential;

  const occurredAt = new Date().toISOString();
  const answer = await postJson(
    credential.ingestUrl,
    {
      batch_id: randomUUID(),
      sent_at: occurredAt,
      events: [
        {
          event_id: randomUUID(),
          event_name: DIAGNOSTIC_TEST_EVENT,
          schema_version: 1,
          occurred_at: occurredAt,
          /*
           * Null, and null together. A diagnostic belongs to no session — there
           * is no visitor in the room — and `sequence` is null exactly when
           * `session_id` is.
           */
          session_id: null,
          sequence: null,
          app: {
            version: HARNESS_BUILD.app_version,
            plugin: HARNESS_BUILD.plugin_version,
            build_id: HARNESS_BUILD.build_id,
            environment: REPORTED_ENVIRONMENT,
          },
          properties: {
            reason: "manual_check",
            /*
             * Null rather than a note. The field is the one place a human types
             * into a payload and it says plainly that it must carry no personal
             * data; a button that fills it with prose nobody asked for is how
             * that rule starts being ignored.
             */
            note: null,
          },
        },
      ],
    },
    credential.token,
  );
  if (isRefused(answer)) return answer;

  const parsed = BatchResponseSchema.safeParse(answer.payload);
  if (!parsed.success) {
    return refuse(describeFailure(credential.ingestUrl, answer.status, answer.payload));
  }

  const result = parsed.data.results[0];
  revalidatePath(REVIEW_SURFACE, "layout");
  return {
    ok: true,
    accepted: parsed.data.accepted,
    duplicate: parsed.data.duplicate,
    rejected: parsed.data.rejected,
    /*
     * The endpoint's own word for what happened to the one event, and the
     * rejection code when there is one. Never re-derived from the counters: a
     * response with no result at all is a shape this contract does not allow,
     * and saying so beats printing "accepted" because `accepted` was 0.
     */
    outcome: result === undefined ? "no result returned" : (result.code ?? result.status),
    detail: result?.detail ?? null,
    warnings: parsed.data.warnings.map((warning) => warning.code),
  };
}

/* --- 4b. send a showroom meeting -------------------------------------------------------- */

/**
 * Send one whole meeting through `/functions/v1/observer-ingest`, as the plugin would.
 *
 * A diagnostic proves an event can be stored. It proves nothing about the
 * other half — that stored events come back as a meeting on Sales Flow — because
 * diagnostics are excluded from every read model by rule. This is the press
 * that exercises that half: the event names and property shapes the shipped
 * plugin sends, in one session, through the real endpoint with the real token.
 *
 * ## What is and is not invented
 *
 * The meeting is this harness's and says so: the agent is
 * `observer-review-harness`, not a name from a roster. The units are NOT
 * invented — they are the first available codes of the catalogue this project's
 * connector delivered, so Unit Attention joins them to real rows; a project
 * with no catalogue gets a meeting with no unit in it rather than a made-up
 * code. There is no rating, because nobody rated anything.
 *
 * A project that receives this stops showing synthetic sessions (ADR-0036,
 * ADR-0038). Deleting `.observer-local/` resets that along with everything else.
 */
export async function meetingAction(): Promise<
  | {
      readonly ok: true;
      readonly accepted: number;
      readonly duplicate: number;
      readonly rejected: number;
      readonly units: readonly string[];
    }
  | Refused
> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const credential = credentialled();
  if (isRefused(credential)) return credential;

  const units = await catalogueCodes(estate.projectId, estate.viewer, 2);

  const sessionId = randomUUID();
  const endedAt = Date.now();
  const startedAt = endedAt - 12 * 60_000;
  let sequence = 0;
  const event = (
    secondsIn: number,
    name: string,
    properties: Record<string, unknown> = {},
    entity: { readonly type: string; readonly id: string } | null = null,
  ) => {
    sequence += 1;
    return {
      event_id: randomUUID(),
      event_name: name,
      schema_version: 1,
      occurred_at: new Date(startedAt + secondsIn * 1000).toISOString(),
      session_id: sessionId,
      sequence,
      app: {
        version: HARNESS_BUILD.app_version,
        plugin: HARNESS_BUILD.plugin_version,
        build_id: HARNESS_BUILD.build_id,
        environment: REPORTED_ENVIRONMENT,
      },
      agent_id: HARNESS_BUILD.plugin_version,
      visitor_subject: "vis_review",
      ...(entity === null ? {} : { entity }),
      properties,
    };
  };

  const residences = { type: "feature", id: "Main|Residences" };
  const events = [
    event(0, "session.started", { client_platform: "review-harness" }),
    event(5, "feature.opened", { category: "Residences" }, residences),
    ...units.flatMap((code, i) => {
      const unit = { type: "unit", id: code };
      const from = 60 + i * 200;
      return [
        event(from, "unit.view.started", { unit_id: code }, unit),
        event(from + 150, "unit.view.ended", { unit_id: code, duration_seconds: 150 }, unit),
        ...(i === 0
          ? [
              event(from + 160, "unit.favourite_added", { unit_id: code }, unit),
              event(from + 170, "unit.document_opened", { document_type: "floorplan_pdf" }, unit),
            ]
          : []),
      ];
    }),
    event(500, "environment.weather_changed", { weather_type: "Clear", time_of_day: "Evening" }),
    event(560, "feature.closed", { duration_ms: 555_000 }, residences),
    event(565, "feature.opened", {}, { type: "feature", id: "Main|Surroundings" }),
    event(700, "meeting.outcome_set", { outcome: "Interested", previous_outcome: "" }),
    event(720, "session.ended", { duration_seconds: 720, end_reason: "agent" }),
  ];

  const answer = await postJson(
    credential.ingestUrl,
    { batch_id: randomUUID(), sent_at: new Date(endedAt).toISOString(), events },
    credential.token,
  );
  if (isRefused(answer)) return answer;

  const parsed = BatchResponseSchema.safeParse(answer.payload);
  if (!parsed.success) {
    return refuse(describeFailure(credential.ingestUrl, answer.status, answer.payload));
  }
  if (parsed.data.rejected > 0) {
    const first = parsed.data.results.find((r) => r.status === "rejected");
    return refuse(
      `${String(parsed.data.rejected)} of ${String(events.length)} events were rejected: ` +
        `${first?.code ?? "no code"}${first?.detail == null ? "" : ` (${first.detail})`}.`,
    );
  }

  /* The dashboard memoises a project's sessions for thirty seconds; a press should not wait for it. */
  forgetSessionMemo();
  revalidatePath("/", "layout");
  return {
    ok: true,
    accepted: parsed.data.accepted,
    duplicate: parsed.data.duplicate,
    rejected: parsed.data.rejected,
    units,
  };
}

/**
 * Up to `count` available unit codes: from whichever connector delivered this project's
 * catalogue, else from the catalogue the customer's own screens draw for its twin — so
 * whatever the meeting opened is a unit those screens can join it to.
 */
async function catalogueCodes(
  projectUuid: string,
  viewer: Viewer,
  count: number,
): Promise<readonly string[]> {
  try {
    const service = await liveConnectorService();
    if (service === null) return [];
    for (const connector of await service.list(projectUuid)) {
      if (!connector.enabled) continue;
      const delivered = await service.currentUnits(projectUuid, connector.kind);
      const available = delivered.filter((u) => u.status === "available");
      if (available.length > 0) return available.slice(0, count).map((u) => u.code);
    }
  } catch {
    /* No catalogue store on this server: fall through to the read model's. */
  }
  try {
    for (const tenant of await repository.listTenants(viewer)) {
      const projects = await repository.listProjects(viewer, tenant.id);
      if (!projects.some((p) => p.slug === DEMONSTRATION_PROJECT_SLUG)) continue;
      const view = await repository.getUnitAttention(
        {
          viewer,
          tenantSlug: tenant.slug,
          projectSlug: DEMONSTRATION_PROJECT_SLUG,
          period: "quarter_to_date",
        },
        null,
      );
      return view.rows
        .filter((row) => row.status === "available")
        .slice(0, count)
        .map((row) => row.unitCode);
    }
  } catch {
    /* The viewer cannot read the twin: the meeting is sent without units. */
  }
  return [];
}

/* --- 5. suspend and resume -------------------------------------------------------------- */

/**
 * Switch the source off. An admin call, and there is no endpoint for it.
 *
 * Deliberately not a credential revocation: a suspended source keeps its
 * credential and stops being accepted, which is what makes resume the mirror
 * image rather than a second activation.
 */
export async function suspendAction(): Promise<{ readonly ok: true } | Refused> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const moved = await estate.admin.suspendSource({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
  });
  if (!moved.ok) return refuse(`The source could not be suspended: ${moved.refusal.code}.`);

  revalidatePath(REVIEW_SURFACE, "layout");
  return { ok: true };
}

/** Switch it back on. Refuses on an archived source, because archival is terminal. */
export async function resumeAction(): Promise<{ readonly ok: true } | Refused> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const moved = await estate.admin.resumeSource({
    account: CONTROL_PLANE_ACCOUNT,
    source: estate.sourceId,
  });
  if (!moved.ok) return refuse(`The source could not be resumed: ${moved.refusal.code}.`);

  revalidatePath(REVIEW_SURFACE, "layout");
  return { ok: true };
}

/* --- 0. build the estate ---------------------------------------------------------- */

/**
 * Build the demonstration estate, from a screen that can be reached with none.
 *
 * `operatorEstate()` already ensures the estate as a side effect of finding it,
 * so this is that call and a revalidation — it deliberately adds no second
 * creation path that could drift from the one every other action here uses.
 *
 * ## Why it exists at all
 *
 * `.observer-local/` is the reset button, and `seed.ts` says so in an error
 * message: delete the directory to rebuild the estate from nothing. That
 * sentence was untrue. Every caller of `demonstrationEstate` was a lifecycle
 * button, all of them on Source Detail, which is reachable only through the
 * projects list — and after a reset the projects list is empty, because the
 * control plane lists projects through the sources they own. The documented
 * recovery led to a screen with no way forward.
 *
 * So the door goes where the dead end was. The action is offered from the empty
 * state of the projects list, under the same development-only gate as the
 * lifecycle driver, and nowhere else.
 */
export async function buildEstateAction(): Promise<{ readonly ok: true } | Refused> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  revalidatePath(REVIEW_SURFACE, "layout");
  return { ok: true };
}

/* --- 6. a busy installation, for visual review ---------------------------------------- */

/**
 * The outbox of a SIMULATED showroom machine under load.
 *
 * ## Why this exists, and why it is not a fixture
 *
 * `HARNESS_QUEUE` above reports zeros and a null ceiling because that is what
 * the harness honestly has: it posts synchronously and owns no outbox. Those
 * are the right numbers and they must stay.
 *
 * They are also useless for judging a design. A composition that has to show
 * queue pressure, an oldest pending event, a quarantine and a capacity refusal
 * cannot be reviewed against eight fields that all read "0" or "Not reported",
 * and a reviewer choosing between three layouts on that basis would be choosing
 * between three empty states.
 *
 * So this is a second SENDER rather than a second view. The numbers below are
 * what a simulated installation reports about its own outbox, and they travel
 * the real heartbeat endpoint, are validated by the real contract and are
 * persisted in the real column. The screen then renders what a sender reported,
 * which is the only thing it ever renders. Nothing is written past the wire and
 * no view is taught to believe anything.
 *
 * The doctrine allows exactly this and names the conditions: extend the
 * synthetic model honestly rather than fabricating a value for a picture, and
 * record the extension. This comment is the record.
 *
 * ## Why these numbers
 *
 * They are chosen to exercise the states a layout has to survive rather than to
 * look tidy. 47% fill is a real proportion of a real ceiling, not a round
 * number. The oldest pending event is minutes old, so the duration formatter
 * has something to shorten. There is one quarantined event and one capacity
 * refusal, because 1 and 0 read differently from 12 and the singular case is
 * the one plural rules get wrong. `last_error` carries a code and never a
 * message, as the contract requires.
 */
const SIMULATED_QUEUE = {
  pending_events: 128,
  oldest_pending_at: null as string | null,
  quarantined_events: 1,
  bytes_used: 3_959_422,
  bytes_ceiling: 8_388_608,
  dropped_events: 1,
} as const;

const SIMULATED_BUILD = {
  app_version: "2.4.1",
  plugin_version: "1.8.0",
  build_id: "ISTER-TOWER-2026.09.03",
  engine_version: "5.4.4",
} as const;

/**
 * Post one heartbeat as a busy installation would.
 *
 * DEVELOPMENT ONLY, through the same gate as every other action in this file,
 * and through the same endpoint with the same credential. If the contract
 * changes under it, this stops working exactly as a real plugin would.
 */
export async function simulateBusyInstallationAction(): Promise<{ readonly ok: true } | Refused> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const credential = credentialled();
  if (isRefused(credential)) return credential;

  const now = Date.now();
  const answer = await postJson(
    credential.heartbeatUrl,
    {
      sent_at: new Date(now).toISOString(),
      build: SIMULATED_BUILD,
      queue: {
        ...SIMULATED_QUEUE,
        /* Four minutes and some seconds, so the duration is not a round number. */
        oldest_pending_at: new Date(now - 263_000).toISOString(),
      },
      last_error: { code: "ingest_capacity_refused", at: new Date(now - 41_000).toISOString() },
    },
    credential.token,
  );
  if (isRefused(answer)) return answer;

  const parsed = HeartbeatResponseSchema.safeParse(answer.payload);
  if (!parsed.success) {
    return refuse(describeFailure(credential.heartbeatUrl, answer.status, answer.payload));
  }

  revalidatePath(REVIEW_SURFACE, "layout");
  return { ok: true };
}

/* --- 7. a reviewable estate -------------------------------------------------------- */

/**
 * The estate a LIST design can actually be judged against.
 *
 * ## Why this exists
 *
 * `demonstrationEstate` creates one project holding one source, which is the
 * right minimum for walking a lifecycle and useless for reviewing a projects
 * index or a diagnostics screen. A list with a single row does not show whether
 * its typography holds, whether its columns align, whether a sorted set reads,
 * or what it looks like when half the estate is waiting and half is delivering.
 * Three visual directions compared on a one-row table would be compared on
 * nothing.
 *
 * ## Why it is not a fixture
 *
 * Every project and every source below is created by `ObserverAdmin` through
 * the same services the real screens call, with the same validation and the
 * same refusals. What lands in the database is what an operator registering
 * these installations by hand would have produced.
 *
 * Their states are real too, and mostly UNACTIVATED, which is exactly what a
 * newly registered estate looks like: a source is created here and switched on
 * afterwards from the showroom machine itself. The demonstration source remains
 * the only one driven through activation, heartbeat and ingestion, so the lists
 * show one delivering installation among several awaiting their first
 * heartbeat. That contrast is the common real case and it is the one a list
 * design has to survive.
 *
 * Nothing here invents a state the product cannot reach.
 *
 * ## Idempotent, by slug and by label
 *
 * Pressing twice must not double the estate. Projects are keyed by slug, which
 * the database already makes unique, and sources by their label within a
 * project, which it does not, so this reads what is there before creating.
 */
const REVIEW_ESTATE: readonly {
  readonly name: string;
  readonly slug: string;
  readonly sources: readonly {
    readonly label: string;
    /* The union the service accepts, so a typo is a compile error and not a refusal. */
    readonly environment: "development" | "staging" | "production" | "demo";
  }[];
}[] = [
  {
    name: "RIVERSIDE QUARTER",
    slug: "riverside-quarter",
    sources: [
      { label: "Sales Suite, Level 3", environment: "production" },
      { label: "Reception pod", environment: "production" },
      { label: "Build machine", environment: "development" },
    ],
  },
  {
    name: "HARBOR VIEW RESIDENCE",
    slug: "harbor-view-residence",
    sources: [
      { label: "Marketing suite", environment: "production" },
      { label: "Rehearsal rig", environment: "staging" },
    ],
  },
  {
    name: "NORTHGATE YARD",
    slug: "northgate-yard",
    sources: [{ label: "Show apartment", environment: "production" }],
  },
];

/**
 * Create the review estate if it is not already there.
 *
 * DEVELOPMENT ONLY, through the same gate as every other action in this file.
 * A refusal from either service is returned as a sentence rather than thrown:
 * this runs behind a button and the answer has to be legible where it lands.
 */
/**
 * More machines in the demonstration project itself.
 *
 * The first version of this seeder put every extra source under a NEW project,
 * which left the demonstration project holding exactly one. Three design
 * directions then all reported the same thing: Project detail was being judged
 * on a list of one row, where an ordering rule, a column alignment and a
 * shared baseline are all invisible.
 *
 * These sit beside Main Showroom PC so that screen has an estate. They are
 * unactivated, like the others, which is the honest state for a source nobody
 * has switched on yet and the contrast the row design has to carry.
 */
const SIBLING_SOURCES: readonly {
  readonly label: string;
  readonly environment: "development" | "staging" | "production" | "demo";
}[] = [
  { label: "Atrium kiosk", environment: "production" },
  { label: "Penthouse suite", environment: "production" },
  { label: "Sales office rehearsal", environment: "staging" },
];

export async function seedReviewEstateAction(): Promise<
  { readonly ok: true; readonly created: number } | Refused
> {
  const estate = await operatorEstate();
  if (isRefused(estate)) return estate;

  const { admin } = estate;
  let created = 0;

  const existing = await admin.projectsForAccount({ account: CONTROL_PLANE_ACCOUNT });
  if (!existing.ok) return refuse("The account's projects could not be read.");

  /*
   * The demonstration project first, because it is the one Project detail
   * opens and the one a reviewer will judge a list on.
   */
  const own = await admin.sourceOperations({
    account: CONTROL_PLANE_ACCOUNT,
    project: estate.projectId,
  });
  const ownLabels = new Set(own.ok ? own.value.map((row) => row.display_label) : []);
  for (const source of SIBLING_SOURCES) {
    if (ownLabels.has(source.label)) continue;
    const made = await admin.createSource({
      account: CONTROL_PLANE_ACCOUNT,
      project: estate.projectId,
      type: DEMONSTRATION_SOURCE_TYPE,
      environment: source.environment,
      label: source.label,
    });
    if (!made.ok) return refuse(`${source.label} could not be created: ${made.refusal.code}.`);
    created += 1;
  }

  for (const wanted of REVIEW_ESTATE) {
    let projectId = existing.value.find((row) => row.name === wanted.name)?.project_id ?? null;

    if (projectId === null) {
      /*
       * `createProject` RAISES on a slug already taken rather than refusing,
       * because that collision is a unique index doing its job. Reaching it
       * here means the project exists under a name this loop did not match, so
       * the honest answer is to skip it rather than to invent a second one.
       */
      try {
        const made = await admin.createProject({
          account: CONTROL_PLANE_ACCOUNT,
          name: wanted.name,
          slug: wanted.slug,
        });
        if (!made.ok) return refuse(`${wanted.name} could not be created: ${made.refusal.code}.`);
        projectId = made.value;
        created += 1;
      } catch {
        continue;
      }
    }

    const held = await admin.sourceOperations({
      account: CONTROL_PLANE_ACCOUNT,
      project: projectId,
    });
    const labels = new Set(held.ok ? held.value.map((row) => row.display_label) : []);

    for (const source of wanted.sources) {
      if (labels.has(source.label)) continue;
      const made = await admin.createSource({
        account: CONTROL_PLANE_ACCOUNT,
        project: projectId,
        type: DEMONSTRATION_SOURCE_TYPE,
        environment: source.environment,
        label: source.label,
      });
      if (!made.ok) return refuse(`${source.label} could not be created: ${made.refusal.code}.`);
      created += 1;
    }
  }

  revalidatePath(REVIEW_SURFACE, "layout");
  return { ok: true, created };
}
