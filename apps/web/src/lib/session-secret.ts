/**
 * THE SESSION SIGNING SECRET, AND THE ONE PLACE IT MAY BE STOOD IN FOR.
 *
 * `OBSERVER_SESSION_SECRET` signs every session token (HMAC-SHA256, in
 * `session.ts`). When it is set, it is the secret. When it is not:
 *
 *   - in development — `OBSERVER_ENVIRONMENT` unset or "development" — a
 *     stand-in is derived from the deployment id, or "local". IT IS NOT A
 *     SECRET: the string is readable in this file and in every deployment's
 *     metadata, and that is why it is allowed only where nothing real stands
 *     behind a session;
 *   - anywhere else — staging, production — there is no stand-in. The process
 *     refuses to start (`instrumentation.ts`), naming the variable, and every
 *     signing call refuses too, so a server that somehow got past boot cannot
 *     mint or accept a token on a key the whole world can read.
 *
 * Until 2026-09-23 the stand-in applied everywhere, and neither the deployment
 * guide nor `.env.example` named the variable — which is how it came to be
 * "not set anywhere yet" for two weeks: a value nobody documents as required
 * is a value nobody sets. A missing secret must stop a process, not be
 * replaced by something that is not one.
 *
 * Pure over an environment source, like `env.ts`'s readers, so the rule is
 * tested without a process and without `next/headers`.
 */

export const SESSION_SECRET_NAME = "OBSERVER_SESSION_SECRET";

export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Thrown, by name, wherever a session would otherwise be signed on a stand-in outside development. */
export class SessionSecretMissingError extends Error {
  override readonly name = "SessionSecretMissingError";
  constructor(environment: string) {
    super(
      `${SESSION_SECRET_NAME} is not set and OBSERVER_ENVIRONMENT is "${environment}": no session ` +
        `can be signed. Set ${SESSION_SECRET_NAME} (64 random bytes, base64 or hex, generated in a ` +
        `password manager and marked sensitive) and start again. The development stand-in is not a ` +
        `secret and is refused outside development.`,
    );
  }
}

/**
 * The secret to sign with, or a thrown `SessionSecretMissingError`.
 *
 * The stand-in is a function of the deployment id so that a token minted on one
 * deployment is refused by the next — the one property it has, stated beside
 * the one it lacks.
 */
export function signingSecretFrom(source: EnvSource): string {
  const configured = source[SESSION_SECRET_NAME];
  if (configured !== undefined && configured.length > 0) return configured;
  const environment = source["OBSERVER_ENVIRONMENT"] ?? "development";
  if (environment !== "development") throw new SessionSecretMissingError(environment);
  return `observer-dev.${source["VERCEL_DEPLOYMENT_ID"] ?? source["VERCEL_GIT_COMMIT_SHA"] ?? "local"}`;
}
