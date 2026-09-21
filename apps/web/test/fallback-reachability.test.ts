import { describe, expect, it } from "vitest";
import { ROLES } from "@observer/metrics";
import { SURFACES, maySeeSurface } from "../src/lib/routes";

/**
 * A surface offered as somewhere else's fallback has to be open to that
 * somewhere else's readers.
 *
 * ## The promise this holds, and how it came to exist
 *
 * The Briefing leads with the highest-ranked attention state. When that state
 * has no action of its own — the no-CRM case, where connecting one is an
 * administrator's job rather than this reader's — the button sends the reader
 * to the register of warnings instead. That is a real door today: `SURFACES`
 * declares the same four roles on both routes.
 *
 * Nothing made it stay that way. Twenty of the forty-three declared surfaces
 * carry a narrower role list than the Briefing does — `/people` leaves out the
 * MADSPACE administrator, `/meetings/[meetingId]` leaves out the developer — so
 * the Briefing's fallback happens to point at one of the twenty-three that are
 * safe. Narrow `/attention` later, for reasons that would look perfectly good
 * at the time, and the fallback becomes a locked door for the excluded role,
 * silently, with every test still green.
 *
 * So the pairing is declared rather than assumed. `why` is not decoration: the
 * failure message below is the only prose anybody is guaranteed to read at the
 * moment the decision is being reversed, six months from now, by somebody who
 * never saw this round.
 *
 * ## Why a property rather than a list comparison
 *
 * The assertion is "every role that may open `from` may open `to`", asked
 * through `maySeeSurface` itself. If the fallback is ever derived at read time
 * instead of assumed — asking the same function per viewer — the property is
 * still the thing worth holding, and this file does not need rewriting to say
 * so.
 */

interface FallbackPair {
  /** The surface that offers the fallback, by its last path segment. */
  readonly from: string;
  /** Where its readers are sent, by last path segment. */
  readonly to: string;
  /** Why the link exists. Printed when the pair breaks. */
  readonly why: string;
}

const FALLBACK_PAIRS: readonly FallbackPair[] = [
  {
    from: "showroom",
    to: "attention",
    why: "the Briefing sends a reader here when its leading state has no action of its own",
  },
];

/** Last path segment of a declared route, which is what `maySeeSurface` keys on. */
function declaredSegments(): ReadonlySet<string> {
  const out = new Set<string>();
  for (const surface of SURFACES) {
    const parts = surface.route.split("/").filter((part) => part.length > 0);
    const last = parts[parts.length - 1];
    if (last !== undefined) out.add(last);
  }
  return out;
}

describe("a fallback destination is open to the readers who are sent there", () => {
  const segments = declaredSegments();

  it.each(FALLBACK_PAIRS.map((pair) => [pair.from, pair.to, pair] as const))(
    "%s → %s",
    (from, to, pair) => {
      /*
       * `maySeeSurface` fails OPEN on a segment it does not know, so a typo
       * here would let every role through and the assertion below would pass
       * without examining anything. Both ends are checked against the registry
       * first — the denominator before the ratio.
       */
      expect(segments.has(from), `"${from}" is not a declared surface`).toBe(true);
      expect(segments.has(to), `"${to}" is not a declared surface`).toBe(true);

      const sentHere = ROLES.filter((role) => maySeeSurface(role, from));
      expect(
        sentHere.length,
        `no role can open "${from}", so this pair proves nothing`,
      ).toBeGreaterThan(0);

      const shutOut = sentHere.filter((role) => !maySeeSurface(role, to));

      expect(
        shutOut,
        shutOut.length === 0
          ? ""
          : [
              ``,
              `"/${to}" no longer admits every reader of "/${from}", and "/${from}" links there:`,
              `  ${pair.why}.`,
              ``,
              `Shut out: ${shutOut.join(", ")}.`,
              ``,
              `This is a product decision, not a lint failure. Narrowing "/${to}" is allowed —`,
              `but then decide what those readers see instead, because today they are offered a`,
              `button that will refuse them. Change this pair when you have decided, and say what`,
              `they get.`,
              ``,
            ].join("\n"),
      ).toEqual([]);
    },
  );
});
