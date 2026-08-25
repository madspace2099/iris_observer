import "server-only";

/**
 * Which environment variable holds the server's Supabase credentials, and
 * whether what is in it could possibly work.
 *
 * One place, because two places disagree. `quota.ts` needs the values and
 * `env.ts` needs to report whether they exist without ever returning them, and
 * when each kept its own list of names they drifted — a deployment could be
 * configured and reported as unconfigured.
 *
 * ## Why there is a list at all
 *
 * A project can be handed its Supabase credentials by a person typing them into
 * Vercel, or by the Vercel–Supabase integration injecting them. The two do not
 * agree on names, and a deployment holding the credentials under a name this
 * code does not read is indistinguishable from one holding no credentials —
 * which cost an afternoon once already.
 *
 * So the accepted names are written down, the ones that are *recognised and
 * deliberately not used* are written down beside them, and a variable that is
 * set but could not work is called malformed rather than counted as present.
 * All three distinctions reach the operator by name.
 */

/**
 * The project URL. Not a secret — it is in every browser request already — so
 * the public spelling is accepted as readily as the private one.
 */
const URL_NAMES = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

/**
 * The server key. Exactly one accepted name.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` is deliberately absent. It is the legacy JWT
 * format, this project was set up on the modern publishable/secret keys, and
 * silently accepting the old one would quietly change which credential a
 * deployment runs on. It is *recognised* below so the operator can be told it
 * was seen and skipped, which is a different thing from ignoring it.
 */
const SECRET_NAMES = ["SUPABASE_SECRET_KEY"] as const;

/** Seen, named in diagnostics, never read. */
const RECOGNISED_BUT_UNUSED = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_JWT_SECRET",
  "POSTGRES_URL",
] as const;

/**
 * Set and usable, set and unusable, or not set.
 *
 * Three states rather than two, because "unusable" is the one that needs
 * saying: a `SUPABASE_URL` of `localhost:54321` with no scheme makes every
 * request throw, the limiter fails open by design, and nothing anywhere says
 * why. Counting that as present would hide it; counting it as absent would
 * send somebody to set a variable that is already set.
 */
type Slot =
  | { readonly state: "present"; readonly name: string; readonly value: string }
  | { readonly state: "malformed"; readonly name: string }
  | { readonly state: "absent" };

function read(
  names: readonly string[],
  source: NodeJS.ProcessEnv,
  usable: (value: string) => boolean,
): Slot {
  for (const name of names) {
    const value = source[name]?.trim();
    if (value === undefined || value.length === 0) continue;
    return usable(value) ? { state: "present", name, value } : { state: "malformed", name };
  }
  return { state: "absent" };
}

/**
 * An origin, and only an origin.
 *
 * The client appends `/rest/v1/…` to this value, so anything already on the end
 * of it silently becomes part of the path: a trailing slash produces `//rest/v1`
 * and a copied `…/rest/v1` produces `/rest/v1/rest/v1`. Both are a 404 from
 * PostgREST, which is indistinguishable from a missing function and from a key
 * whose role cannot see one — three different problems, one status code, and no
 * way to tell them apart from outside.
 *
 * A trailing slash is forgiven because it is unambiguous and common; a path is
 * not, because it means the value is not what this variable is for.
 */
function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
    return parsed.search === "" && parsed.hash === "";
  } catch {
    return false;
  }
}

/**
 * A key that could be a key.
 *
 * Shape only, never a network check — the API is the only thing that can say
 * whether a credential is *valid*. What this catches is the class of mistake
 * people actually make at a keyboard, and it has now caught the same one twice
 * on two different variables:
 *
 *   - the legacy `service_role` JWT pasted into the slot meant for a modern
 *     secret key. Both are long opaque strings, and the wrong one fails much
 *     further downstream with a permission error that names nothing;
 *   - a value carrying the punctuation from wherever it was copied. The OpenAI
 *     key arrived wrapped in placeholder angle brackets and returned 401 on
 *     every call for hours. A key is opaque and unpunctuated: no whitespace, no
 *     brackets, no quotes. Anything else is a paste that brought its container
 *     along.
 */
function isSecretKey(value: string): boolean {
  if (value.startsWith("eyJ")) return false;
  if (/[\s<>"'`]/.test(value)) return false;
  return value.length >= 20;
}

function slots(source: NodeJS.ProcessEnv) {
  return {
    url: read(URL_NAMES, source, isHttpUrl),
    key: read(SECRET_NAMES, source, isSecretKey),
  };
}

export interface ServerSupabase {
  readonly url: string;
  readonly key: string;
  /** Which variables were used. Names only — for a log line, never a payload. */
  readonly from: readonly string[];
}

/**
 * The credentials, or null.
 *
 * The only function in the codebase that returns the secret key, and it is
 * `server-only`. Its one caller is the shared quota limiter.
 */
export function resolveServerSupabase(
  source: NodeJS.ProcessEnv = process.env,
): ServerSupabase | null {
  const { url, key } = slots(source);
  if (url.state !== "present" || key.state !== "present") return null;
  return { url: url.value, key: key.value, from: [url.name, key.name] };
}

/**
 * What a deployment can be *told* about its own Supabase configuration.
 *
 * Names and booleans. Nothing here can carry a value, which is what makes it
 * safe to write to a log that somebody else may read over a shoulder.
 */
export interface SupabaseDiagnosis {
  readonly configured: boolean;
  /** Accepted names that are set and usable. */
  readonly using: readonly string[];
  /** Accepted names that are not set at all. */
  readonly missing: readonly string[];
  /** Accepted names that are set to something that cannot work. */
  readonly malformed: readonly string[];
  /** Set, understood, and deliberately not read. */
  readonly ignored: readonly string[];
  /**
   * The host the client will call, or null.
   *
   * A Supabase project ref is not a credential — it is in the URL of every
   * browser request any Supabase application makes. It is here because a
   * deployment pointed at the wrong project is indistinguishable from one with
   * a bad key until somebody says which host is being called, and that cost
   * five rounds of inference to establish once.
   */
  readonly host: string | null;
}

export function diagnoseServerSupabase(
  source: NodeJS.ProcessEnv = process.env,
): SupabaseDiagnosis {
  const { url, key } = slots(source);

  const using: string[] = [];
  const missing: string[] = [];
  const malformed: string[] = [];

  for (const [slot, canonical] of [
    [url, URL_NAMES[0]],
    [key, SECRET_NAMES[0]],
  ] as const) {
    if (slot.state === "present") using.push(slot.name);
    else if (slot.state === "malformed") malformed.push(slot.name);
    else missing.push(canonical);
  }

  const ignored = RECOGNISED_BUT_UNUSED.filter((name) => {
    const value = source[name];
    return value !== undefined && value.trim().length > 0;
  });

  let host: string | null = null;
  if (url.state === "present") {
    try {
      host = new URL(url.value).host;
    } catch {
      host = null;
    }
  }

  return {
    configured: url.state === "present" && key.state === "present",
    using,
    missing,
    malformed,
    ignored,
    host,
  };
}
