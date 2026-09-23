/**
 * THE SYNTHETIC CONTACT DIRECTORY: THE ONE PLACE A BUYER'S NAME LIVES.
 *
 * The showroom sessions link a third of their meetings to a contact by an
 * opaque id (`con_1000` … `con_1040`, `showroom/sessions.ts`) and carry
 * nothing else about the person — `docs/05-identity.md` §2 rule 3, and the
 * contracts' own split: `Contact` carries no personal data, `ContactPii`
 * holds the name behind its own permission, `Lead.consent` records whether
 * behavioural history may be associated with the person, and
 * `Contact.erasedAt` is the erasure tombstone. This directory is the
 * synthetic phase's stand-in for those three records, field for field, so
 * the read model's join reads the same facts it will read from a store:
 *
 *   `fullName`                     ← `ContactPii.fullName`, nullable
 *   `consent.behaviouralLinking`   ← `Lead.consent.behaviouralLinking`
 *   `erasedAt`                     ← `Contact.erasedAt`
 *
 * It is a directory and not a session field: the name is joined per render
 * by the read model (`buildMeetingRows`), is never written onto a session, a
 * projection or an event, and reaches a screen only behind
 * `AGENT_REGISTER_ROLES`. `docs/22-visitor-name-display.md` §6's three
 * promises — joined, not stored; gone on withdrawal; deleted on deletion —
 * are what `visitorNameFor` implements and the tests beside it hold.
 *
 * The population is deterministic in the index, like everything else in the
 * fixture, and it is deliberately not uniform: some contacts withdrew the
 * consent, some never gave a name, one is erased. A directory in which every
 * contact resolved to a name would let a reader forget that the label beside
 * it is the ordinary case.
 *
 * `world.ts` keeps a separate, older list of three people (`CONTACTS`,
 * `cnt_…`) for the pre-meeting brief's fixture. They are not linked from any
 * session and this directory does not know them; folding the two together is
 * `docs/22` §7 step 6, which retires the brief's literals, and not this file.
 */

export interface ContactRecord {
  readonly contactId: string;
  /** `ContactPii.fullName`. Null where the source never recorded one. */
  readonly fullName: string | null;
  /** `Lead.consent`, as far as the join reads it. */
  readonly consent: {
    readonly behaviouralLinking: boolean;
    readonly textVersion: string;
    readonly capturedAt: string;
  };
  /** `Contact.erasedAt`. A tombstone: the id stays resolvable, the person is gone. */
  readonly erasedAt: string | null;
}

/** The consent text version the brief's fixture also cites (`agent.ts`). */
const CONSENT_TEXT_VERSION = "hu-2026-06";

/** Invented people. None of these is an agent, a viewer or anybody real. */
const GIVEN = [
  "Adéla",
  "Boris",
  "Csilla",
  "Dušan",
  "Erika",
  "Filip",
  "Gréta",
  "Hugo",
  "Ilona",
  "Jakub",
  "Klára",
  "Ladislav",
  "Marek",
  "Nóra",
  "Oskar",
  "Réka",
] as const;
const FAMILY = [
  "Balog",
  "Čierna",
  "Dobos",
  "Fábry",
  "Gajdoš",
  "Halmi",
  "Ivanič",
  "Jurčo",
  "Kende",
  "Lukáč",
  "Mészáros",
  "Oravec",
  "Polák",
  "Rácz",
  "Szabó",
  "Tóth",
  "Urban",
  "Vince",
  "Zeman",
  "Žák",
] as const;

/** How many contacts the sessions can link. Matches `index % 41` in `sessions.ts`. */
const CONTACT_COUNT = 41;

export const CONTACT_DIRECTORY: readonly ContactRecord[] = Array.from(
  { length: CONTACT_COUNT },
  (_, index): ContactRecord => ({
    contactId: `con_${String(1000 + index)}`,
    /* Every eleventh contact came in with no name recorded. */
    fullName:
      index % 11 === 5
        ? null
        : `${GIVEN[index % GIVEN.length] ?? "Anna"} ${FAMILY[(index * 7) % FAMILY.length] ?? "Novotná"}`,
    consent: {
      /* Every seventh contact withdrew the behavioural-linking consent. */
      behaviouralLinking: index % 7 !== 3,
      textVersion: CONSENT_TEXT_VERSION,
      capturedAt: "2026-06-14T09:00:00.000+02:00",
    },
    /* One contact exercised erasure; the tombstone stays, the person does not. */
    erasedAt: index % 13 === 9 ? "2026-08-01T00:00:00.000+02:00" : null,
  }),
);

export function contactRecordById(contactId: string): ContactRecord | undefined {
  return CONTACT_DIRECTORY.find((c) => c.contactId === contactId);
}

/**
 * The name a register may print beside a meeting, or null.
 *
 * Null for a walk-in (no contact), for an id the directory does not hold, for
 * an erased contact, for one whose behavioural-linking consent is withdrawn,
 * and for one with no name recorded. The viewer's role is not this function's
 * question — the read model applies `AGENT_REGISTER_ROLES` before calling it —
 * so that the consent rule can be tested on its own, without a viewer.
 */
export function visitorNameFor(contactId: string | null): string | null {
  if (contactId === null) return null;
  const contact = contactRecordById(contactId);
  if (contact === undefined || contact.erasedAt !== null) return null;
  if (!contact.consent.behaviouralLinking) return null;
  return contact.fullName;
}
