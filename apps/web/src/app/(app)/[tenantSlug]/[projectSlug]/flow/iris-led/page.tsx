import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_LANGUAGE, type PeriodPreset } from "@observer/readmodels";

import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { maySeeSurface } from "@/lib/routes";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { InfoTip } from "@/components/iris/InfoTip";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { portraitSources } from "@/lib/portraits/server";
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
  /*
   * A face beside each presenter in the key (ADR-0054). The table's "Shown by"
   * keeps names alone: up to five a sale, a face each doubled every row's height,
   * and the key above pairs each face with its name and colour.
   */
  const portraits = await portraitSources(
    view.context.tenant,
    projectSlug,
    view.agents.map((agent) => agent.id),
  );

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker iris-kicker-measured">
          <Link href={link(`${root}/flow`)}>Sales Flow</Link> · IRIS-led sales ·{" "}
          {view.context.period.label}
        </p>
        <SpokenVerdict
          sentence={view.headline}
          meetings={view.verdictMeetings}
          locale={view.context.project.locale}
          replay={period}
        />

        {/*
         * The headline says the rule in a line; how it is counted and what it
         * does not say stand behind the one control (review, 2026-10-23: the
         * definition was a six-line paragraph under the headline, eight on a phone).
         */}
        <div className="ir-led-define">
          <details className="ir-led-info">
            <summary>
              <b aria-hidden="true">i</b>
              How it is counted, and what it does not say
            </summary>
            <div className="ir-led-info-panel">
              <p>{view.definition}</p>
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
            {view.figures.length === 0 ? (
              /* Nothing to count: what could not be placed is the page's first word, not its last. */
              view.unplacedNote === null ? null : (
                <p className="iris-lede">{view.unplacedNote}</p>
              )
            ) : (
              <div className="d-card">
                {/*
                 * The Sales Flow card's other frame stands behind the title's
                 * `i`, one press from the figures it qualifies; what the figures
                 * leave out is printed under them, as the read model's contract
                 * says (review, round 9), and each figure's denominator under it.
                 */}
                <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
                  <h2 className="iris-kicker iris-kicker-measured">
                    {view.context.period.label}: the sales against their showings
                  </h2>
                  {view.frameNote === null ? null : (
                    <InfoTip id="led-figures" label="these figures">
                      {view.frameNote}
                    </InfoTip>
                  )}
                </header>
                <div className="iris-kpis ir-led-figures">
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
                {view.unplacedNote === null ? null : (
                  <p className="iris-meta iris-meta-measured" style={{ marginTop: ".75rem" }}>
                    {view.unplacedNote}
                  </p>
                )}
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
                <IrisLedLegend agents={view.agents} period={period} portraits={portraits} />
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
                    { key: "rule", label: `Within ${String(view.counts.windowHours)} h` },
                  ]}
                  rows={view.sales.map((sale) => ({
                    key: sale.id,
                    cells: {
                      unit:
                        sale.unitHref === null ? (
                          sale.unitCode
                        ) : (
                          <Link prefetch={false} href={link(sale.unitHref)}>
                            {sale.unitCode}
                          </Link>
                        ),
                      /*
                       * The caption says each date is the CRM's where it states
                       * one, so only a date a sync first saw is marked: "the
                       * CRM's date" under all nineteen rows said the caption
                       * nineteen times (review, 2026-10-23).
                       */
                      change: (
                        <>
                          <span className="ir-led-nowrap">
                            {sale.changeLabel} · {sale.changeDisplay}
                          </span>
                          {sale.source === "crm_deal" && sale.dateBasis === "crm_stated" ? null : (
                            <>
                              <br />
                              <span className="iris-code">{sale.dateWhose}</span>
                            </>
                          )}
                        </>
                      ),
                      /*
                       * The count in the row, and how it splits about the period
                       * with the meetings themselves one press away: the split
                       * ("15: 6 in the period, 9 before it") made every row three
                       * to five lines, and a second column counted the same
                       * meetings again (review, 2026-10-23).
                       */
                      showings: (
                        <details className="ir-led-meetings">
                          <summary title={sale.showingsDisplay}>{sale.showings.length}</summary>
                          <p>{sale.showingsDisplay}</p>
                          <ul>
                            {sale.showings.map((showing) => (
                              <li key={showing.meetingId}>
                                {canOpen ? (
                                  <Link prefetch={false} href={link(showing.meetingHref)}>
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
                      rule: sale.verdictLabel,
                    },
                  }))}
                />
              </div>
            )}

            {/*
             * The sales the showroom never showed, and where every sale here was
             * read, are one card (review, 2026-10-23): two cards closed the page
             * with the same thirty-word sentence on the demonstration CRM. With
             * a sale never shown, the never-shown note says it and the reading
             * note stands behind the title's `i`. With none, the headline's
             * "N of N" already says every sale was shown, and the reading note
             * is the card: the two notes end on the same sentence, so one card
             * printed it twice, once in view and once behind its `i` (round 9).
             */}
            <div className="d-card">
              <header className="iris-titled" style={{ marginBottom: ".875rem" }}>
                <h2 className="iris-kicker iris-kicker-measured">
                  {view.neverShown.length === 0
                    ? "Where these sales were read"
                    : "Sales the showroom never showed"}
                </h2>
                {view.neverShown.length === 0 ? null : (
                  <InfoTip id="led-read" label="where these sales were read">
                    {view.source.note}
                  </InfoTip>
                )}
              </header>
              <p className="iris-meta iris-meta-measured" style={{ marginBottom: ".75rem" }}>
                {view.neverShown.length === 0 ? view.source.note : view.neverShownNote}
              </p>
              {view.neverShown.length === 0 ? null : (
                <ul className="ir-led-never">
                  {view.neverShown.map((sale) => (
                    <li key={sale.id}>
                      <span className="ir-led-unit">
                        {sale.unitHref === null ? (
                          sale.unitCode
                        ) : (
                          <Link prefetch={false} href={link(sale.unitHref)}>
                            {sale.unitCode}
                          </Link>
                        )}
                      </span>
                      <span>
                        {sale.changeLabel} · {sale.changeDisplay}. {sale.statement}
                      </span>
                    </li>
                  ))}
                </ul>
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
