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
 * reads in three steps, largest first:
 *
 *   1. one verdict line, with both paces in it, and what the pace stands on;
 *   2. the stock: four figures and one bar of every flat;
 *   3. the window: the sell-out date, the time from start to it with today
 *      marked, and when the project sells out at the current pace.
 *
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
      {pace === null ? null : <p className="iris-plan-basis">{pace.basis}</p>}

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
          <dl className="iris-plan-figures" data-figures="window">
            <div data-absent={window === null ? "true" : undefined}>
              <dt>Sell out by</dt>
              <dd>{window === null ? "Not set" : window.sellOutByDisplay}</dd>
            </div>
          </dl>
          {window === null ? null : (
            <div
              className="iris-plan-time"
              style={{ "--at": window.elapsed } as React.CSSProperties}
            >
              <span className="iris-plan-today">Today · {window.remainingDisplay}</span>
              <span className="iris-plan-track" aria-hidden="true">
                <i />
                <b />
              </span>
              <span className="iris-plan-ends">
                <span>{window.startsOnDisplay}</span>
                <span>{window.sellOutByDisplay}</span>
              </span>
            </div>
          )}
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
