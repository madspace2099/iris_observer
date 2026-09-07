/**
 * THE ONE SHAPE EVERY CONNECTOR SPEAKS HTTP THROUGH.
 *
 * Injected, never imported: an adapter receives a function that turns a
 * request into a response, and the tests hand it a fixture instead of a
 * network. That is what makes a connector's mapping provable without a
 * credential, and what keeps `fetch` — and with it any chance of a secret in
 * a log line — in exactly one place above this package.
 */

export interface HttpRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  /** Header names lower-cased, so `retry-after` is found however it was sent. */
  readonly headers: Readonly<Record<string, string>>;
  readonly text: string;
}

export type Http = (request: HttpRequest) => Promise<HttpResponse>;

export interface FetchContext {
  readonly http: Http;
  readonly now: () => Date;
}

/**
 * Why a fetch produced no snapshot.
 *
 * A category and a retry hint, never the response body: a CRM's error text
 * can quote the login that failed, and the one place that string must never
 * travel is into a log or a screen. `detail` is a sentence written here.
 */
export interface ConnectorRefusal {
  readonly ok: false;
  readonly reason: "unauthorised" | "rate_limited" | "unavailable" | "malformed" | "misconfigured";
  readonly retryAfterSeconds: number | null;
  readonly detail: string;
}

export function retryAfter(headers: Readonly<Record<string, string>>): number | null {
  const raw = headers["retry-after"];
  if (raw === undefined) return null;
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

export function refusal(
  reason: ConnectorRefusal["reason"],
  detail: string,
  retryAfterSeconds: number | null = null,
): ConnectorRefusal {
  return { ok: false, reason, retryAfterSeconds, detail };
}

/**
 * The refusals every HTTP-backed connector shares, by status.
 *
 * Returns null for a status the caller should read as success. `418` is
 * REALPAD's "deprecated API version" and is unavailable, not a joke: the
 * adapter is out of date and no retry will help.
 */
export function refusalForStatus(
  status: number,
  headers: Readonly<Record<string, string>>,
): ConnectorRefusal | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) {
    return refusal(
      "unauthorised",
      "The connector's credential was refused. It may be wrong, not yet activated, or temporarily banned after failed attempts.",
    );
  }
  if (status === 429) {
    return refusal(
      "rate_limited",
      "The source is rate-limiting this credential.",
      retryAfter(headers),
    );
  }
  if (status === 418) {
    return refusal("unavailable", "The source reports this API version as deprecated.");
  }
  if (status === 400 || status === 415 || status === 422) {
    return refusal(
      "misconfigured",
      "The source rejected the request's parameters. The connector's configuration needs checking.",
    );
  }
  return refusal("unavailable", `The source answered ${status}.`);
}

export function lowerCaseHeaders(
  headers: Iterable<readonly [string, string]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers) out[k.toLowerCase()] = v;
  return out;
}
