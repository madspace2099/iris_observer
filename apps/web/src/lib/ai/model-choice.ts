import type { DemoModelAccess } from "@/lib/env";
import { modelEntry, RECOMMENDED_DEFAULT, type ModelId } from "@/lib/models/catalogue";
import type { ModelGrant } from "./provider";

/**
 * THE READER'S MODEL, WHERE A DEMONSTRATION KEY ANSWERS (ADR-0043).
 *
 * A company's key, or the owner's, answers with one model unless the reader
 * picks another of the catalogue's in the Ask composer. The pick is a cookie
 * on this browser, read by the page that names the model and by the stream
 * route that spends the key, so the two cannot disagree. It is read through
 * `parseOverride`, so a value that is not a catalogue id is no choice at all.
 * An account's own connection keeps its Settings preferences; this is never
 * read on that path.
 */
export const ASK_MODEL_COOKIE = "observer_ask_model";

/** A year: a choice outlives a session, and costs nothing to keep. */
export const ASK_MODEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The choice as a request carries it, read from its own `Cookie` header. Unvalidated. */
export function askModelCookie(request: Request): string | undefined {
  const match = request.headers.get("cookie")?.match(/(?:^|;\s*)observer_ask_model=([^;]*)/);
  return match?.[1];
}

/** The grant a demonstration key answers with: the reader's choice, else the key's own model. */
export function demoGrant(demo: DemoModelAccess, chosen: ModelId | null): ModelGrant {
  return chosen === null
    ? { model: RECOMMENDED_DEFAULT, apiKey: demo.apiKey, wireModel: demo.model }
    : { model: chosen, apiKey: demo.apiKey, wireModel: modelEntry(chosen).apiIdentifier };
}

/** The model a demonstration key would name, with the reader's choice over the key's own. */
export function demoModelNamed(wire: string | null, chosen: ModelId | null): string | null {
  return wire === null ? null : chosen === null ? wire : modelEntry(chosen).apiIdentifier;
}
