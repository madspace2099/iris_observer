import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No register says "No CRM" over a follow-up the agent recorded.
 *
 * The meeting register drew a band — "no CRM is connected to this project, so
 * no meeting on it carries a verified follow-up" — and a terse mark in every
 * cell; the agent's register printed "No CRM" as a follow-up state. The
 * follow-up is read off the outcome recorded in the room, and no CRM is asked.
 *
 * Source assertions on the JSX, comments stripped: a comment may name the old
 * claim to say why it went.
 */

const web = resolve(import.meta.dirname, "..");
const markup = (path: string): string =>
  readFileSync(resolve(web, path), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const REGISTERS = [
  "src/components/meetings/MeetingRegister.tsx",
  "src/components/agents/MeetingRegister.tsx",
] as const;

describe("the registers' follow-up column", () => {
  it.each(REGISTERS)("%s names no CRM as the reason a follow-up cannot be read", (path) => {
    expect(
      markup(path),
      "a register still tells the reader the CRM owns the follow-up",
    ).not.toMatch(/no crm/i);
  });
});
