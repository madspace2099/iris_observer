import type { ReactNode } from "react";
import type { InsightSource } from "@observer/contracts";
import type { SalesPlan as SalesPlanModel } from "@observer/readmodels";

import { InfoTip } from "@/components/iris/InfoTip";
import { SourceChips } from "@/showroom/sources";

import "./plan.css";

/**
 * SOLD AGAINST THE PLAN, SAID PLAINLY (ADR-0055).
 *
 * The owner, recording the Shark demo (2026-10-22), could not read the bullet
 * chart this replaces: show the flats, how many are sold, and how long the
 * sales run against a date by which everything must be sold. So the block
 * reads in three steps:
 *
 *   1. one short verdict, first: "On pace", "Behind", or the state that
 *      stands in for one;
 *   2. the stock: four large figures and one bar of every flat;
 *   3. the window and the pace: the sell-out date, the time from start to it
 *      with today marked, the two paces as figures, what the selling pace
 *      stands on, and when the project sells out at it.
 *
 * Each fact is said once (review, 2026-10-22): no "Not set" under a verdict
 * that says no date is set, no date printed twice, no basis without a pace.
 * Every figure and sentence is the read model's; the definitions stand behind
 * the `i`. The two bars repeat figures printed in words beside them, so they
 * are hidden from assistive technology rather than described twice.
 */
export function SalesPlan({
  plan,
  sources,
  editor,
}: {
  readonly plan: SalesPlanModel;
  readonly sources: readonly InsightSource[];
  /** The company admin's control for the two dates, or a line saying who sets them; null for nothing. */
  readonly editor: ReactNode;
}) {
  const { window, pace } = plan;
  const paces = [
    { id: "selling", label: "Selling a month", value: pace?.sellingDisplay ?? null },
    { id: "needed", label: "Needed a month", value: pace?.neededDisplay ?? null },
  ].filter((p) => p.value !== null);
  return (
    <section className="d-card iris-plan" aria-labelledby="sales-plan-title">
      <header className="iris-titled">
        <h2 className="iris-kicker iris-kicker-measured" id="sales-plan-title">
          Sold against the plan
        </h2>
        <InfoTip id="sales-plan" label="sold against the plan">
          {plan.definition}
        </InfoTip>
      </header>

      <p className="iris-plan-verdict" data-verdict={plan.verdict}>
        <span className="iris-plan-mark" aria-hidden="true" />
        {plan.verdictText}
      </p>

      <div className="iris-plan-cols">
        <div className="iris-plan-col">
          <dl className="iris-plan-figures">
            {plan.total === null ? null : (
              <div>
                <dt>Flats</dt>
                <dd>{plan.total}</dd>
              </div>
            )}
            {plan.parts.map((part) => (
              <div key={part.id} data-part={part.id}>
                <dt>
                  <i aria-hidden="true" />
                  {part.label}
                </dt>
                <dd>{part.count}</dd>
              </div>
            ))}
          </dl>
          {plan.parts.length === 0 ? null : (
            <div className="iris-plan-stock" aria-hidden="true">
              {plan.parts.map((part) =>
                part.count === 0 ? null : (
                  <span
                    key={part.id}
                    data-part={part.id}
                    style={{ "--share": part.share } as React.CSSProperties}
                  />
                ),
              )}
            </div>
          )}
          {plan.stockNote === null ? null : <p className="iris-plan-note">{plan.stockNote}</p>}
        </div>

        <div className="iris-plan-col">
          {window === null ? null : (
            <>
              <dl className="iris-plan-figures" data-figures="window">
                <div>
                  <dt>Sell out by</dt>
                  <dd>{window.sellOutByDisplay}</dd>
                </div>
              </dl>
              <div
                className="iris-plan-time"
                style={{ "--at": window.elapsed } as React.CSSProperties}
              >
                <span className="iris-plan-today">Today · {window.remainingDisplay}</span>
                <span className="iris-plan-track" aria-hidden="true">
                  <i />
                  <b />
                </span>
                <span className="iris-plan-ends">From {window.startsOnDisplay}</span>
              </div>
            </>
          )}
          {paces.length === 0 ? null : (
            <dl className="iris-plan-figures" data-figures="pace">
              {paces.map((p) => (
                <div key={p.id}>
                  <dt>{p.label}</dt>
                  <dd>{p.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {pace?.sellingDisplay == null ? null : <p className="iris-plan-basis">{pace.basis}</p>}
          {pace?.sellsOutDisplay == null ? null : (
            <p className="iris-plan-out">
              At this pace, sold out in <b>{pace.sellsOutDisplay}</b>
            </p>
          )}
          {editor}
        </div>
      </div>

      <SourceChips sources={sources} measured />
    </section>
  );
}
