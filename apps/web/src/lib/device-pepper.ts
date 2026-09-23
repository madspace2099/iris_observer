import { onDeploymentPlatform } from "@/lib/deployment-markers";

/**
 * THE PEPPER BEHIND THE VENDOR-FACING SAFETY IDENTIFIER, AND ITS ONE STAND-IN.
 *
 * `DEVICE_CREDENTIAL_PEPPER` keys the HMAC that names a viewer to the model
 * vendor (`ai/identity.ts`). It has to be two things at once: a secret, or the
 * identifier is a pseudonym only in name — the viewer ids come from a
 * six-entry directory, so with a public key the mapping is a table anybody can
 * build and the identifier is one anybody can forge; and STABLE across
 * deployments, or the vendor sees a new person after every deploy and the
 * one thing the identifier is for — tracing abuse to one account over time —
 * is lost. A secret derived from a deployment id would satisfy neither. So it
 * is a configured value, set once and kept, like `OBSERVER_SUBJECT_PEPPER`.
 *
 * Until 2026-09-23 a missing value was replaced everywhere by a fixed string
 * readable in the source ("not a crash — the identifier is a refinement"),
 * and `.env.example` described the variable as something it never was. Now
 * the same rule as the session secret: on a developer's own machine a
 * stand-in, stated as not a secret; anywhere else — staging, production, or
 * any process a deployment platform runs — a named refusal at boot and at
 * every call. Pure over an environment source, so the rule is tested without
 * a process.
 */

export const DEVICE_PEPPER_NAME = "DEVICE_CREDENTIAL_PEPPER";

export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Thrown, by name, wherever a safety identifier would otherwise be keyed on a stand-in outside development. */
export class DevicePepperMissingError extends Error {
  override readonly name = "DevicePepperMissingError";
  constructor(environment: string, onPlatform: boolean) {
    super(
      `${DEVICE_PEPPER_NAME} is not set and OBSERVER_ENVIRONMENT is "${environment}"` +
        `${onPlatform ? " on a deployment platform" : ""}: no safety identifier can be keyed. Set ` +
        `${DEVICE_PEPPER_NAME} (32 or more random bytes, base64 or hex, generated in a password manager, ` +
        `marked sensitive, and kept the same across deployments so the identifier stays stable) and ` +
        `start again. The development stand-in is not a secret and is refused outside development ` +
        `and on every deployment platform.`,
    );
  }
}

/**
 * The pepper to key with, or a thrown `DevicePepperMissingError`.
 *
 * The development stand-in is a constant, not a deployment-derived value: the
 * identifier's stability matters even in development, where a developer's
 * own vendor account sees the same identifier across restarts.
 */
export function devicePepperFrom(source: EnvSource): string {
  const configured = source[DEVICE_PEPPER_NAME];
  if (configured !== undefined && configured.length > 0) return configured;
  const environment = source["OBSERVER_ENVIRONMENT"] ?? "development";
  const onPlatform = onDeploymentPlatform(source);
  if (environment !== "development" || onPlatform) {
    throw new DevicePepperMissingError(environment, onPlatform);
  }
  return "observer-safety-identifier-development-stand-in";
}
