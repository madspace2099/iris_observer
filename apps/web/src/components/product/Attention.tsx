import Link from "next/link";
import type { AlertItem, AlertSeverity, PeriodPreset } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";
import { Evidence } from "./Provenance";

/**
 * ATTENTION — what is worth a decision, and what red is reserved for.
 *
 * ## Two vocabularies, one map
 *
 * `ALERT_SEVERITIES` in `@observer/readmodels` is `critical | warning | info`.
 * `observer-product.css` §12 draws `data-severity="info" | "attention" |
 * "critical"`. They are the same three levels under two names, and this map is
 * the only place they meet — the read model is not going to be renamed to suit
 * a stylesheet, and the stylesheet's "attention" is the better word on screen
 * because "warning" invites an exclamation mark and this product does not
 * shout.
 *
 * ## Why critical is drawn so much louder than the other two
 *
 * The sheet reserves the only red in the system for it, and the rule is
 * narrower than "bad": critical means **data is being lost right now**.
 * "Demand is falling" is attention — it is a reading, and it will still be true
 * tomorrow. "The showroom has not reported in four days" is critical, because
 * every figure below it is quietly ageing and the reader cannot tell from the
 * figures themselves. A surface that raises critical for a falling number
 * spends the one loud signal the product has on something that did not need it.
 *
 * That judgement belongs to the read model, which sets `severity`. This
 * component does not second-guess it; the rule is recorded here because this is
 * where a reviewer will look when a screen turns red.
 *
 * ## Why an empty list is a RESULT and not an empty panel
 *
 * "Nothing needs attention" is one of the most useful things this product can
 * say, and it is the answer to the question the reader came with. Drawing it as
 * a dashed `.ox-empty` slot would say "this panel failed to fill", which is a
 * different statement and an alarming one. It gets `.ox-result` — a solid panel
 * with a settled chip and a sentence — exactly as §21 of the sheet requires.
 */
const SEVERITY: Readonly<Record<AlertSeverity, string>> = {
  critical: "critical",
  warning: "attention",
  info: "info",
};

/**
 * The same three words as `SEVERITY` above, read aloud rather than matched by
 * a CSS selector — see `components/attention/StateList.tsx`'s copy of this
 * same pair for why it is not exported and reached into instead.
 */
const SEVERITY_LABEL: Readonly<Record<AlertSeverity, string>> = {
  critical: "Critical",
  warning: "Attention",
  info: "Info",
};

export function AttentionList({
  alerts,
  period,
  emptyNote = "Nothing needs attention in this period.",
  label = "Needs attention",
}: {
  readonly alerts: readonly AlertItem[];
  readonly period: PeriodPreset;
  readonly emptyNote?: string;
  /** The accessible name of the list. Screens usually head it visibly as well. */
  readonly label?: string;
}) {
  if (alerts.length === 0) {
    return (
      <p className="ox-result">
        <span className="ox-chip" data-tone="good">
          <span className="ox-chip-mark" aria-hidden="true" />
          Clear
        </span>
        {emptyNote}
      </p>
    );
  }

  return (
    <ul className="ox-attention" aria-label={label}>
      {alerts.map((alert) => (
        <li className="ox-alert" key={alert.id} data-severity={SEVERITY[alert.severity]}>
          <div>
            {/*
             * `h3`, because an attention list is always rendered under a section
             * heading and never as the first thing on a screen. A surface that
             * needs a different level has a structural problem this component
             * cannot fix by taking a prop.
             */}
            <h3 className="ox-alert-title">
              <span className="ox-alert-mark" aria-hidden="true" />
              <span className="ox-sr">{SEVERITY_LABEL[alert.severity]} — </span>
              {alert.title}
            </h3>
            <p className="ox-alert-detail">{alert.detail}</p>
            <div className="ox-alert-foot">
              <Evidence evidence={alert.evidence} period={period} />
              {/*
               * A LABEL WITH NO ROUTE IS NOT A BUTTON.
               *
               * `actionLabel` and `actionHref` are independently nullable, so a
               * read model can name what should happen without yet having a
               * surface to send the reader to. Drawing that as a control — even
               * a disabled one — would be a control that looks ready and does
               * nothing, which the doctrine forbids outright. It is drawn as
               * what it actually is: a sentence about what to do next.
               */}
              {alert.actionLabel !== null && alert.actionHref === null ? (
                <span className="ox-n">{alert.actionLabel} — no surface for this yet</span>
              ) : null}
            </div>
          </div>

          {alert.actionHref === null || alert.actionLabel === null ? null : (
            <Link
              className="ox-btn"
              data-weight={alert.severity === "critical" ? "primary" : undefined}
              href={dynamicRoute(withPeriod(alert.actionHref, period))}
            >
              {alert.actionLabel}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
