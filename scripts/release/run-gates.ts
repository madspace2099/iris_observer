/**
 * Runs every release gate and records what it MEASURED, not what somebody
 * remembered.
 *
 *   pnpm release:gates
 *
 * The output, `.release/gate-results.json`, is what renders section 7 of
 * `REVIEW.txt`. Test counts used to be typed into that document by hand, which
 * is the same class of defect as a hand-copied bucket age: correct on the day,
 * silently wrong on the next. `facts.ts` refuses to render a table from results
 * recorded at a different commit, and says so in the document rather than
 * quietly using them.
 */

import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { REPO_ROOT, git } from "./facts";

interface VitestFile {
  readonly name: string;
  readonly assertionResults: readonly { readonly status: string }[];
}

/**
 * `shell` is per-call, and both settings are load-bearing on Windows.
 *
 * Node refuses to spawn a `.cmd` shim directly — EINVAL, since the
 * argument-injection hardening in Node 20 — so every `pnpm` gate came back
 * "FAILED" with no output, which looks exactly like six real failures. Running
 * those through a shell fixes it. Running an EXECUTABLE through a shell breaks
 * it the other way: `process.execPath` is `C:\Program Files\nodejs\node.exe`,
 * and the shell splits it at the space.
 */
const run = (
  label: string,
  command: string,
  args: readonly string[],
  shell = false,
): { ok: boolean; out: string } => {
  process.stdout.write(`  ${label.padEnd(24)}`);
  try {
    const out = execFileSync(command, [...args], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 64 * 1024 * 1024,
      shell,
    });
    console.log("clean");
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    console.log("FAILED");
    return { ok: false, out: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
};

/* pnpm is a .cmd shim on Windows and needs a shell; see run(). */
const pnpm = "pnpm";
const NEEDS_SHELL = process.platform === "win32";

function main(): void {
  const head = git("rev-parse", "HEAD");
  console.log(`running the gates at ${head.slice(0, 7)}`);

  const gates: Record<string, string> = {};
  let failed = 0;
  const record = (label: string, key: string, args: readonly string[], pass = "clean"): void => {
    const r = run(label, pnpm, args, NEEDS_SHELL);
    gates[key] = r.ok ? pass : "FAILED";
    if (!r.ok) {
      failed += 1;
      console.log(r.out.split("\n").slice(-25).join("\n"));
    }
  };

  record("pnpm format:check", "pnpm format:check", ["format:check"]);
  record("pnpm typecheck", "pnpm typecheck", ["typecheck"], "0 errors");
  record("pnpm lint", "pnpm lint", ["lint"]);

  /* Tests, with per-file counts read from the reporter rather than counted. */
  const reportFile = join(tmpdir(), `observer-vitest-${process.pid}.json`);
  const tests = run(
    "pnpm test",
    pnpm,
    ["exec", "vitest", "run", "--reporter=json", `--outputFile=${reportFile}`],
    NEEDS_SHELL,
  );
  let total = 0;
  let files = 0;
  const perFile: Record<string, number> = {};
  if (existsSync(reportFile)) {
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as {
      testResults: readonly VitestFile[];
    };
    for (const f of report.testResults) {
      const n = f.assertionResults.length;
      perFile[basename(f.name).replace(/\.test\.ts$/, "")] = n;
      total += n;
      files += 1;
    }
    rmSync(reportFile, { force: true });
  }
  gates["pnpm test"] = tests.ok ? `${total} passed / ${files} files` : "FAILED";
  if (!tests.ok) {
    failed += 1;
    /*
     * Every other gate prints its output on failure; this one did not, so a
     * failing suite reported the single word "FAILED" and nothing else — the
     * one gate whose failure a reader most needs to see.
     */
    console.log(tests.out.split("\n").slice(-40).join("\n"));
  }

  record("pnpm build", "pnpm build", ["build"]);
  record("secret audit", "secret audit", ["audit:secrets"]);

  /* Raw NUL bytes in a tracked file break tooling in ways that hide. */
  const nul = git("ls-files", "-z")
    .split("\0")
    .filter((f) => f.length > 0)
    .filter((f) => {
      try {
        return readFileSync(join(REPO_ROOT, f)).includes(0);
      } catch {
        return false;
      }
    });
  console.log(
    `  ${"raw-NUL scan".padEnd(24)}${nul.length === 0 ? "0 in any tracked file" : `${nul.length} FOUND`}`,
  );
  gates["raw-NUL scan"] = nul.length === 0 ? "0 in any tracked file" : `${nul.length} FOUND`;
  if (nul.length > 0) failed += 1;

  /* The wrappers must still match their sources. */
  const wrappers = run("wrappers match source", process.execPath, [
    join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
    join(REPO_ROOT, "scripts", "release", "wrap-migration.ts"),
    "--check",
  ]);
  gates["wrappers vs sources"] = wrappers.ok ? "every body byte-identical" : "FAILED";
  if (!wrappers.ok) failed += 1;

  mkdirSync(join(REPO_ROOT, ".release"), { recursive: true });
  writeFileSync(
    join(REPO_ROOT, ".release", "gate-results.json"),
    `${JSON.stringify({ head, tests: { total, files, perFile }, gates }, null, 2)}\n`,
    "utf8",
  );

  console.log("");
  console.log(`  recorded to .release/gate-results.json at ${head.slice(0, 7)}`);
  if (failed > 0) {
    console.log(`  ${failed} GATE(S) FAILED`);
    process.exit(1);
  }
}

main();
