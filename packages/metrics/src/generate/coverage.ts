import {
  REQUIREMENTS,
  REQUIREMENT_SOURCES,
  unresolvedRequirements,
  uncoveredRequirements,
  type RequirementSource,
  type SourceRequirement,
} from "../requirements.js";
import { getMetric } from "../registry/index.js";

/**
 * Generates the source-requirement coverage report.
 *
 * Grouped by where the requirement came from, because that is how it gets
 * reviewed: the person who asked for something wants to find their own list,
 * not scan a merged table.
 */

const HEADER = `<!--
  GENERATED FILE — do not edit by hand.
  Produced by: pnpm matrix        Verified by: packages/metrics/test/coverage.test.ts
  Source of truth: packages/metrics/src/requirements.ts
-->`;

const SOURCE_TITLES: Record<RequirementSource, string> = {
  stano: "Stano Bajaník consultation",
  sales_agent_flow: "Showroom IRIS sales-agent flow",
  madspace: "MADSPACE decisions",
  webiris_addendum: "WEBIRIS cross-channel addendum",
};

function coverageCell(r: SourceRequirement): string {
  const parts: string[] = [];
  for (const id of r.metrics ?? []) {
    const known = getMetric(id) !== undefined;
    parts.push(known ? `\`${id}\`` : `**\`${id}\` — MISSING**`);
  }
  for (const model of r.readModels ?? []) parts.push(`_${model}_`);
  for (const contract of r.contracts ?? []) parts.push(contract);
  if (r.deferredTo !== undefined) parts.push(`⏭ ${r.deferredTo}`);
  return parts.length === 0 ? "—" : parts.join("<br>");
}

function statusCell(r: SourceRequirement): string {
  if (r.unresolved !== undefined) return "❓ open";
  if ((r.metrics?.length ?? 0) > 0) return "✅ metric";
  if ((r.readModels?.length ?? 0) > 0 || (r.contracts?.length ?? 0) > 0) return "✅ contract";
  if (r.deferredTo !== undefined) return "⏭ deferred";
  return "❌ uncovered";
}

export function renderCoverageMarkdown(): string {
  const uncovered = uncoveredRequirements();
  const unresolved = unresolvedRequirements();

  const sections = REQUIREMENT_SOURCES.map((source) => {
    const rows = REQUIREMENTS.filter((r) => r.source === source);
    const table = [
      "| Requirement | Family | Covered by | Status |",
      "| --- | --- | --- | --- |",
      ...rows.map(
        (r) =>
          `| ${r.requirement} | ${r.family.replace(/_/g, " ")} | ${coverageCell(r)} | ${statusCell(r)} |`,
      ),
    ].join("\n");
    return `## ${SOURCE_TITLES[source]}\n\n${rows.length} requirements.\n\n${table}`;
  }).join("\n\n---\n\n");

  const openList =
    unresolved.length === 0
      ? "_None._"
      : unresolved.map((r) => `### ${r.requirement}\n\n${r.unresolved ?? ""}`).join("\n\n");

  return `${HEADER}

# Source-requirement coverage

Every requirement that entered IRIS Observer, where it came from, and what satisfies it. Generated
from \`packages/metrics/src/requirements.ts\`; a requirement with nothing against it fails the test
suite rather than quietly disappearing.

Coverage is not always a metric. Some requirements are answered by a read model, some by a contract
or a decision, and some are still open — those are listed in full at the end rather than counted as
done.

- Requirements tracked: **${REQUIREMENTS.length}**
- Uncovered: **${uncovered.length}**
- Open decisions: **${unresolved.length}**

---

${sections}

---

## Open decisions

These are not gaps in the build. They are questions the product has not answered yet, recorded so
that nobody mistakes silence for agreement.

${openList}
`;
}

export interface CoverageJson {
  readonly total: number;
  readonly uncovered: readonly string[];
  readonly unresolved: readonly { readonly id: string; readonly question: string }[];
  readonly bySource: Readonly<Record<string, number>>;
}

export function renderCoverageJson(): CoverageJson {
  const bySource: Record<string, number> = {};
  for (const source of REQUIREMENT_SOURCES) {
    bySource[source] = REQUIREMENTS.filter((r) => r.source === source).length;
  }
  return {
    total: REQUIREMENTS.length,
    uncovered: uncoveredRequirements().map((r) => r.id),
    unresolved: unresolvedRequirements().map((r) => ({ id: r.id, question: r.unresolved ?? "" })),
    bySource,
  };
}
