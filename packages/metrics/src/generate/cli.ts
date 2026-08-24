import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderMatrixJson, renderMatrixMarkdown } from "./matrix";
import { renderCoverageJson, renderCoverageMarkdown } from "./coverage";

/**
 * Writes the generated measurement matrix and the source-requirement coverage
 * report.
 *
 * Run from the repository root with `pnpm matrix`. Both outputs are verified
 * by test, so a registry or requirement change that is not regenerated fails
 * CI rather than quietly leaving the documentation wrong.
 */
const root = resolve(process.cwd());

const outputs: readonly [string, string][] = [
  ["docs/measurement-matrix.md", renderMatrixMarkdown()],
  ["docs/measurement-matrix.json", `${JSON.stringify(renderMatrixJson(), null, 2)}\n`],
  ["docs/coverage-report.md", renderCoverageMarkdown()],
  ["docs/coverage-report.json", `${JSON.stringify(renderCoverageJson(), null, 2)}\n`],
];

for (const [relativePath, contents] of outputs) {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
  console.log(`wrote ${relativePath}`);
}
