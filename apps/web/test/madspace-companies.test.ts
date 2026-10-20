import { describe, expect, it } from "vitest";
import { VIEWERS } from "@observer/synthetic";
import type { Viewer } from "@observer/readmodels";

/**
 * THE DIRECTORY IS ONE LIST OF COMPANIES (ADR-0047).
 *
 * Developers, sales agencies and MADSPACE side by side, every person in exactly
 * one of them, an agency naming the developers it sells for, and MADSPACE's
 * holding tenant listed under MADSPACE rather than passed off as a developer.
 */
describe("the company directory", () => {
  it("lists every person once, under the company they work for", async () => {
    const { companyDirectory } = await import("../src/lib/madspace/companies");
    const directory = await companyDirectory(VIEWERS.madspace as Viewer);

    const people = directory.companies.flatMap((c) => c.people.map((p) => p.email));
    expect(new Set(people).size).toBe(people.length);
    expect(people.length).toBe(directory.people);

    const kinds = new Map(directory.companies.map((c) => [c.name, c.kind]));
    expect(kinds.get("Shark Developments")).toBe("developer");
    expect(kinds.get("Shark Sales")).toBe("agency");
    expect(kinds.get("MADSPACE")).toBe("madspace");
    expect(kinds.has("MADSPACE Integration Sandbox")).toBe(false);

    const meridian = directory.companies.find((c) => c.name === "Meridian Sales");
    expect(meridian?.sellsFor).toEqual(["Alpha Estates", "Beta Development"]);
    const madspace = directory.companies.find((c) => c.kind === "madspace");
    expect(madspace?.projects.map((p) => p.name)).toEqual(["Akhilesh Demo Source"]);
  });
});
