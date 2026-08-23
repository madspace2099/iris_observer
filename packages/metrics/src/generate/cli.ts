import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderMatrixJson, renderMatrixMarkdown } from "./matrix.js";

/**
 * Writes the generated measurement dependency matrix.
 *
 * Run from the repository root with `pnpm matrix`. The committed output is
 * verified by test, so a registry change that is not regenerated fails CI
 * rather than quietly leaving the documentation wrong.
 */
const root = resolve(process.cwd());
const markdownPath = resolve(root, "docs/measurement-matrix.md");
const jsonPath = resolve(root, "docs/measurement-matrix.json");

mkdirSync(dirname(markdownPath), { recursive: true });
writeFileSync(markdownPath, renderMatrixMarkdown(), "utf8");
writeFileSync(jsonPath, `${JSON.stringify(renderMatrixJson(), null, 2)}\n`, "utf8");

console.log(`wrote ${markdownPath}`);
console.log(`wrote ${jsonPath}`);
