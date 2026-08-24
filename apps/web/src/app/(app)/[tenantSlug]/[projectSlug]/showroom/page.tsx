import type { Metadata } from "next";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { Changes, Coverage, Figures, Finding, OutcomeContext, SourceChips } from "@/showroom/parts";
import { presetFrom } from "@/lib/period";

export const metadata: Metadata = { title: "Showroom" };

/**
 * The Showroom Overview — the product's front door.
 *
 * Answers four questions in ten seconds: what happened inside IRIS this
 * period, what changed, what pattern is worth noticing, and what to look at
 * next. Presentation behaviour leads; the CRM's account of what closed sits
 * at the bottom of the evidence field, labelled as context (ADR-0023).
 */
export default async function ShowroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const { period } = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(period) as PeriodPreset,
  };
  const overview = await repository.getShowroomOverview(query);

  return (
    <div className="iris-two">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">
          {overview.context.tenant.name} · {overview.context.project.name} ·{" "}
          {overview.context.period.label}
        </p>

        <h1 className="iris-verdict">{overview.verdict}</h1>
        <p className="iris-body" style={{ maxWidth: "60ch", color: "var(--ink-2)" }}>
          {overview.verdictDetail}
        </p>
        <SourceChips sources={overview.verdictSources} />

        <hr className="iris-rule" />
        <Figures figures={overview.figures} />
        <hr className="iris-rule" />

        <div>
          <p className="iris-kicker" style={{ marginBottom: ".25rem" }}>
            What is worth noticing
          </p>
          {overview.findings.map((finding, index) => (
            <Finding key={finding.id} finding={finding} lead={index === 0} />
          ))}
        </div>
      </section>

      <aside className="iris-plane iris-plane--raised iris-stack">
        <Changes changes={overview.changes} />
        <hr className="iris-rule" />
        <Coverage coverage={overview.coverage} />
        <hr className="iris-rule" />
        <OutcomeContext outcomes={overview.outcomeContext} total={overview.meetingCount} />
      </aside>
    </div>
  );
}
