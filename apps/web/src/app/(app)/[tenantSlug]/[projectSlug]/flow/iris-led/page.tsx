import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_LANGUAGE, type PeriodPreset } from "@observer/readmodels";

import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { maySeeSurface } from "@/lib/routes";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { IrisLedLegend, IrisLedTimeline } from "@/components/flow/IrisLedTimeline";
import { DataTable } from "@/components/product/DataTable";
import { Empty } from "@/components/product/Absence";
import { SourceChips } from "@/showroom/parts";
import { KpiCard } from "@/showroom/charts2";
import "@/components/flow/iris-led.css";

export const metadata: Metadata = { title: "IRIS-led sales" };

/**
 * IRIS-LED SALES — which of the period's sales the showroom showed first (ADR-0049).
 *
 * A drill-down from Sales Flow's IRIS-assisted card, in the owner's words. The
 * page states a rule about ORDER and prints what the read model wrote: the
 * sentence IRIS says, four figures each with its denominator, a timeline of
 * every showing before every sale, the table of sales, and the sales the
 * showroom never showed, listed rather than dropped. Why "led" is not "caused"
 * sits behind the info control, one click from the rule it qualifies.
 */
export default async function IrisLedPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "iris-led", `/${tenantSlug}/${projectSlug}`);
  /* A showing opens its replay only for a role the replay admits (R08-6). */
  const canOpen = maySeeSurface(viewer.role, "[meetingId]");
  const period = presetFrom((await searchParams).period) as PeriodPreset;

  const view = await repository.getIrisLedSales({
    viewer,
    tenantSlug,
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  });
  const root = `/${tenantSlug}/${projectSlug}`;
  const here = `${root}/flow/iris-led`;
  const link = (href: string) => dynamicRoute(withPeriod(href, period));

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker iris-kicker-measured">
          <Link href={link(`${root}/flow`)}>Sales flow</Link> · IRIS-led sales ·{" "}
          {view.context.period.label}
        </p>
        <SpokenVerdict
          sentence={view.headline}
          meetings={view.verdictMeetings}
          locale={view.context.project.locale}
          replay={period}
        />

        <div className="ir-led-define">
          <p className="iris-lede">{view.definition}</p>
          <details className="ir-led-info">
            <summary>
              <b aria-hidden="true">i</b>
              What this does not say
            </summary>
            <div className="ir-led-info-panel">
              <p>{view.caveat}</p>
            </div>
          </details>
        </div>

        {view.source === null ? (
          <div className="d-card">
            <Empty
              title="No CRM is connected"
              note="IRIS-led sales need the CRM's reservations and sales, or a catalogue whose availability a sync can see change. A company admin connects one in the account settings."
            />
            <p style={{ marginTop: "1rem" }}>
              <Link
                className="ox-btn"
                data-weight="primary"
                href={dynamicRoute(`/settings/crm?from=${encodeURIComponent(here)}`)}
              >
                Connect your CRM
              </Link>
            </p>
          </div>
        ) : (
          <>
            {view.figures.length === 0 ? null : (
              <div className="d-card">
                <h2
                  className="iris-kicker iris-kicker-measured"
                  style={{ marginBottom: ".875rem" }}
                >
                  {view.context.period.label}, every figure over its denominator
                </h2>
                <div className="iris-kpis">
                  {view.figures.map((figure) => (
                    <KpiCard
                      key={figure.id}
                      label={figure.label}
                      value={figure.value}
                      qualifier={figure.of}
                      delta={null}
                      tone="flat"
                    />
                  ))}
                </div>
              </div>
            )}

            {view.sales.length === 0 ? null : (
              <div className="d-card">
                <h2
                  className="iris-kicker iris-kicker-measured"
                  style={{ marginBottom: ".875rem" }}
                >
                  Every showing before every sale
                </h2>
                <IrisLedLegend agents={view.agents} period={period} />
                <IrisLedTimeline view={view} period={period} canOpen={canOpen} />
              </div>
            )}

            {view.sales.length === 0 ? null : (
              <div className="d-card">
                <h2
                  className="iris-kicker iris-kicker-measured"
                  style={{ marginBottom: ".875rem" }}
                >
                  The sales, one row each
                </h2>
                <DataTable
                  caption={view.tableCaption}
                  period={period}
                  codeColumn="unit"
                  columns={[
                    { key: "unit", label: "Flat" },
                    { key: "change", label: "Status change" },
                    { key: "showings", label: "Showings before" },
                    { key: "first", label: "First shown" },
                    { key: "last", label: "Last shown" },
                    { key: "gap", label: "Last showing to change" },
                    { key: "agents", label: "Shown by" },
                    { key: "meetings", label: "Meetings" },
                    { key: "rule", label: `Within ${String(view.counts.windowHours)} h` },
                  ]}
                  rows={view.sales.map((sale) => ({
                    key: sale.id,
                    cells: {
                      unit:
                        sale.unitHref === null ? (
                          sale.unitCode
                        ) : (
                          <Link href={link(sale.unitHref)}>{sale.unitCode}</Link>
                        ),
                      change: (
                        <>
                          {sale.changeLabel} · {sale.changeDisplay}
                          <br />
                          <span className="iris-code">{sale.dateWhose}</span>
                        </>
                      ),
                      showings: sale.showingsDisplay,
                      first: sale.firstShownDisplay,
                      last: sale.lastShownDisplay,
                      gap: sale.gapDisplay,
                      agents: (
                        <span className="ir-led-agents">
                          {sale.agents.map((agent) =>
                            agent.href === null ? (
                              <span key={agent.id}>{agent.name}</span>
                            ) : (
                              <Link key={agent.id} href={link(agent.href)}>
                                {agent.name}
                              </Link>
                            ),
                          )}
                        </span>
                      ),
                      meetings: (
                        <details className="ir-led-meetings">
                          <summary>
                            {sale.showings.length}{" "}
                            {sale.showings.length === 1 ? "meeting" : "meetings"}
                          </summary>
                          <ul>
                            {sale.showings.map((showing) => (
                              <li key={showing.meetingId}>
                                {canOpen ? (
                                  <Link href={link(showing.meetingHref)}>
                                    {showing.dateDisplay}
                                  </Link>
                                ) : (
                                  showing.dateDisplay
                                )}{" "}
                                · {showing.agentName}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ),
                      rule: sale.verdictLabel,
                    },
                  }))}
                />
              </div>
            )}

            {view.counts.sales === 0 ? null : (
              <div className="d-card">
                <h2
                  className="iris-kicker iris-kicker-measured"
                  style={{ marginBottom: ".875rem" }}
                >
                  Sales the showroom never showed
                </h2>
                <p className="iris-meta iris-meta-measured" style={{ marginBottom: ".75rem" }}>
                  {view.neverShownNote}
                </p>
                {view.neverShown.length === 0 ? null : (
                  <ul className="ir-led-never">
                    {view.neverShown.map((sale) => (
                      <li key={sale.id}>
                        <span className="ir-led-unit">
                          {sale.unitHref === null ? (
                            sale.unitCode
                          ) : (
                            <Link href={link(sale.unitHref)}>{sale.unitCode}</Link>
                          )}
                        </span>
                        <span>
                          {sale.changeLabel} · {sale.changeDisplay}. {sale.statement}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="d-card">
              <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".75rem" }}>
                Where these sales were read
              </h2>
              <p className="iris-meta iris-meta-measured">{view.source.note}</p>
              {view.unplacedNote === null ? null : (
                <p className="iris-meta iris-meta-measured" style={{ marginTop: ".5rem" }}>
                  {view.unplacedNote}
                </p>
              )}
              <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]} measured />
              <p style={{ marginTop: ".75rem" }}>
                <Link
                  className="ox-btn"
                  data-weight="quiet"
                  href={dynamicRoute(`/settings/crm?from=${encodeURIComponent(here)}`)}
                >
                  CRM settings
                </Link>
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
