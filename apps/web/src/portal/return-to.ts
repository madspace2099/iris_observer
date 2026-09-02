/**
 * WHERE A REDIRECT IS ALLOWED TO SEND SOMEBODY.
 *
 * `returnTo` exists so that following a link into the application, being asked
 * to sign in, and arriving back where you meant to go is one movement. It is
 * also the classic open-redirect: a parameter the browser controls, handed
 * straight to a redirect.
 *
 * So this is an allow-list by construction rather than a list of things to
 * reject. A value survives only if it is a path on this origin, and everything
 * that could make it something else is refused before the shape is even
 * considered:
 *
 *   - anything with a scheme, so `https://elsewhere` cannot pass;
 *   - anything starting `//`, which a browser resolves as protocol-relative and
 *     therefore as another host;
 *   - anything with a backslash, which some browsers normalise to `/`;
 *   - anything encoding either of those, checked after one decode, so
 *     `%2F%2Fevil.example` is caught;
 *   - anything that is not one of the routes this application serves.
 *
 * The last rule is the one that matters most, and it is why this is not a
 * regular expression on the string. `/sign-in` is not a destination — returning
 * there is a loop — and neither is a route that does not exist.
 */

/** The route families a reader may be sent back to after signing in. */
const ALLOWED: readonly RegExp[] = [
  /^\/projects$/,
  /^\/madspace$/,
  /^\/[a-z0-9-]{1,64}\/[a-z0-9-]{1,64}\/(showroom|flow|project|agents|presentation|units|storytelling|meetings|audience|people|overview)$/,
  /^\/[a-z0-9-]{1,64}\/[a-z0-9-]{1,64}\/meetings\/[a-z0-9_-]{1,64}$/,
];

/**
 * A validated internal destination, or null.
 *
 * Null means "use the default", never "use what was asked for anyway".
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 512) return null;

  /*
   * One decode, then the same checks. A caller can only encode so far before
   * the value stops looking like a path at all, and a second decode would let
   * a double-encoded scheme through a check written for a single one.
   */
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }

  for (const candidate of [value, decoded]) {
    if (!candidate.startsWith("/")) return null;
    if (candidate.startsWith("//")) return null;
    if (candidate.includes("\\")) return null;
    if (candidate.includes(":")) return null;
    /* A fragment or a query would let the target carry its own instructions. */
    if (candidate.includes("?") || candidate.includes("#")) return null;
  }

  return ALLOWED.some((pattern) => pattern.test(decoded)) ? decoded : null;
}
