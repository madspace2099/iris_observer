import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { scanForForbiddenContent } from "@observer/contracts/ue5";
import { CONTACT_DIRECTORY } from "../src/contacts";
import { sessionsForProject } from "../src/showroom/sessions";
import { PROJECTS } from "../src/world";

/**
 * THE NAME IS IN NO STORED RECORD AND NO EVENT.
 *
 * `docs/22-visitor-name-display.md` §6, the third promise, and
 * `docs/05-identity.md` §2 rule 3: a name, an email or a phone number is
 * never in an event or an observation. The contact directory is the one
 * place a buyer's name lives, and the read model joins it per render; this
 * test holds that nothing the synthetic phase stores or emits carries one —
 * every session of every project (the stored records this phase has, and
 * the projection every event of the UE5 contract is folded into), and every
 * fixture of the UE5 wire contract under `docs/ue5-contract/fixtures`.
 *
 * Two readers, because they catch different leaks: `scanForForbiddenContent`
 * is the contract's own scanner and flags a personal key (`visitorName`,
 * `fullName`, …), an email or a phone wherever it sits in a record; a
 * substring search for the directory's names catches a name that arrived
 * under an innocent key. The scanner "cannot prove an absence of personal
 * data" (§6), which is why the second reader exists and why the discipline
 * holds at display: the join is the only path, and it writes nothing back.
 */

const FIXTURES = resolve(import.meta.dirname, "../../../docs/ue5-contract/fixtures");

describe("the buyer's name and the records", () => {
  it("is in no stored record and no event", () => {
    const names = CONTACT_DIRECTORY.map((c) => c.fullName).filter((n): n is string => n !== null);
    const sessions = PROJECTS.flatMap((p) => sessionsForProject(p.id as string));

    const findings = sessions.flatMap((s) =>
      scanForForbiddenContent(s as unknown as Record<string, unknown>).map(
        (f) => `${s.meetingId}: ${f.path} (${f.kind})`,
      ),
    );
    const recordsJson = JSON.stringify(sessions);
    const namedInRecords = names.filter((n) => recordsJson.includes(n));

    const fixtures = readdirSync(FIXTURES)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({ file: f, text: readFileSync(resolve(FIXTURES, f), "utf8") }));
    const namedInEvents = fixtures.flatMap(({ file, text }) =>
      names.filter((n) => text.includes(n)).map((n) => `${file}: ${n}`),
    );

    expect({
      sessions: sessions.length > 0,
      fixtures: fixtures.length > 0,
      findings,
      namedInRecords,
      namedInEvents,
    }).toEqual({
      sessions: true,
      fixtures: true,
      findings: [],
      namedInRecords: [],
      namedInEvents: [],
    });
  });
});
