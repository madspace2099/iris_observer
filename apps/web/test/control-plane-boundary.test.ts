import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LOCAL CONTROL PLANE STAYS ON THE SERVER, AND STAYS OUT OF PRODUCTION.
 *
 * `local-db.ts` runs a real Postgres — PGlite, the same WASM build the migration
 * suites use — inside the development server so the operations screens can read
 * and write the tables the three endpoints do. That is what makes those screens
 * honest rather than a mockup with a database-shaped hole in it.
 *
 * It is also the single most dangerous file in the application to get wrong.
 * A WASM Postgres in a browser bundle would be megabytes of dead weight on a
 * customer's first paint; a control plane that opened in production would be a
 * second, unmanaged database beside the real one. Neither failure announces
 * itself — a production build that quietly includes the package still works.
 *
 * Four properties, each asserted against the source rather than assumed from a
 * configuration file:
 *
 *   - the module is `server-only`, so importing it from a client component is a
 *     build error rather than a bundle;
 *   - the package is imported DYNAMICALLY and nowhere statically, because a
 *     static import is resolved and bundled whatever the runtime guards say;
 *   - `next.config.ts` lists it as server-external, so it is never considered
 *     for the browser bundle at all;
 *   - the gate requires a non-production `NODE_ENV` **and** an explicit opt-in.
 *
 * None of these is redundant. The first three are about where the code goes and
 * the fourth is about whether it runs, and a file can pass any three while
 * failing the one that matters.
 */

const web = resolve(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(join(web, path), "utf8");

const LOCAL_DB = "src/lib/sources/local-db.ts";
const PACKAGE = "@electric-sql/pglite";

describe("the local control plane cannot reach a browser", () => {
  it("marks the module server-only", () => {
    /*
     * The one line that turns a mistake into a build failure. Without it, a
     * client component importing `localControlPlaneEnabled` — a plausible thing
     * to want — would pull the whole module graph behind it.
     */
    expect(read(LOCAL_DB)).toContain('import "server-only"');
  });

  it("imports PGlite dynamically and never statically", () => {
    const source = read(LOCAL_DB);
    expect(source).toContain(`await import("${PACKAGE}")`);
    expect(source).not.toContain(`from "${PACKAGE}"`);
  });

  it("declares the package server-external to Next", () => {
    expect(read("next.config.ts")).toContain(`serverExternalPackages: ["${PACKAGE}"]`);
  });

  it("is the only file in the application that names the package at all", () => {
    /*
     * Asserted across the whole source, not just at the one file, because the
     * guarantee is about the application rather than about this module. A
     * second importer — a route handler, a helper, a component that wanted "a
     * quick local database" — would be outside every protection above.
     */
    const every = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        return statSync(path).isDirectory() ? every(path) : [path];
      });

    const src = join(web, "src");
    const offenders = every(src)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => readFileSync(f, "utf8").includes(PACKAGE))
      .map((f) => f.slice(src.length).split("\\").join("/"));

    expect(offenders).toEqual(["/lib/sources/local-db.ts"]);
  });
});

describe("the local control plane cannot open in production", () => {
  it("requires a non-production NODE_ENV and an explicit opt-in", () => {
    const source = read(LOCAL_DB);
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('process.env["OBSERVER_LOCAL_CONTROL_PLANE"] === "1"');
  });

  it("has one gate, so a caller cannot reach the database around it", () => {
    /*
     * `localControlPlaneDb` returns null before it does anything else, and it
     * is the only export that hands back a connection. A second path to
     * `connect()` would be a control plane with the gate written beside it
     * rather than in front of it.
     */
    const source = read(LOCAL_DB);
    expect(source).toContain("if (!localControlPlaneEnabled()) return null;");
    /* Call sites, not the declaration — which the bare name also matches. */
    expect(source.match(/(?<!function )\bconnect\(\)/g) ?? []).toHaveLength(1);
  });

  it("keeps its data under the gitignored directory and nowhere else", () => {
    /*
     * The database and the demonstration ledger share a lifetime deliberately:
     * there is no facade that lists projects, so a ledger outliving its
     * database would name a project id nothing could resolve. One directory
     * means `rm -rf .observer-local` resets all of it at once — which is the
     * documented reset, and what the screenshot walk depends on.
     */
    const source = read(LOCAL_DB);
    expect(source).toContain('join(repositoryRoot(), ".observer-local")');
    expect(readFileSync(resolve(web, "../..", ".gitignore"), "utf8")).toContain(".observer-local/");
  });
});
