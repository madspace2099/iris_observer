import type { AgentOutcomeRing, PeriodPreset } from "@observer/readmodels";

import { PersonCard, Sample } from "@/components/product";
import { OutcomeKey, OutcomeRing } from "@/showroom/charts";

/**
 * HOW EACH PRESENTER'S MEETINGS END — a roster, and the reason it is a roster.
 *
 * The read model's own argument for the shape is in `views3.ts` and it is the
 * right one: an outcome mix is parts of one whole, and six bars per person
 * invites the reader to compare heights across people, which is the league
 * table this product refuses to be. Side by side the rings are comparable as
 * SHAPES, and the counts are still written down beside them.
 *
 * ## The doughnut, weighed against the anti-slop rule
 *
 * "Decorative doughnuts" are named in the doctrine's §8 and this one is not
 * decorative. It carries a genuine parts-of-a-whole — seven mutually exclusive
 * meeting outcomes over one presenter's meetings — the denominator is printed
 * in the hole rather than implied, and every slice's own count is in the key
 * beneath it. A ring that failed any of those three would be a picture of a
 * percentage and would be cut. This one is the only form on the surface that
 * shows composition per person without ranking anybody.
 *
 * ## Why `.ox-people` rather than a grid of panels
 *
 * `observer-product.css` §22 is written for exactly this: "a roster that is not
 * a leaderboard — deliberately no rank number, no medal, no ordering by
 * outcome". The order here is the read model's, which is the agent roster's own
 * order and not a sort on any figure. `PersonCard` has no `rank` prop and will
 * not get one.
 *
 * ## What is deliberately NOT shown, and why
 *
 * `AgentOutcomeRing.progressedShare` is a raw fraction between zero and one.
 * Turning it into "62% progressed" needs the project's locale, which no
 * component in this product may hold (ADR-0012, and the note in `Metric.tsx`
 * about why nothing in the primitive layer formats a number). The previous
 * surface rounded and appended a percent sign in the page body; that is a
 * component computing a metric, and it is not repeated here. What the reader
 * gets instead is every slice's count and the meeting total — the same
 * information, in figures the read model supplied. The gap is reported.
 *
 * ## The flag
 *
 * A flag is raised only where a pattern is worth a conversation, and it is
 * written as a fact an agent can answer rather than as a rank. The sample size
 * stands beside every card whether or not a flag was raised, so a shape drawn
 * from nine meetings and one drawn from forty are never read as equals.
 */
export function AgentOutcomes({
  rings,
  period,
}: {
  readonly rings: readonly AgentOutcomeRing[];
  readonly period: PeriodPreset;
}) {
  return (
    <ul className="ox-people">
      {rings.map((ring) => (
        <PersonCard key={ring.agentId} name={ring.name} href={ring.href} period={period}>
          <OutcomeRing
            slices={ring.slices}
            total={ring.meetings}
            size={124}
            label={`${ring.name}: how ${ring.meetings} meetings ended`}
          />
          <OutcomeKey slices={ring.slices} />

          {ring.flag === null ? null : (
            <p className="ox-section-note">
              <span
                className="ox-chip"
                data-tone={ring.flag.severity === "concern" ? "poor" : "watch"}
              >
                <span className="ox-chip-mark" aria-hidden="true" />
                Worth a conversation
              </span>{" "}
              {ring.flag.text}
            </p>
          )}

          <Sample n={ring.meetings} noun="meetings" />
        </PersonCard>
      ))}
    </ul>
  );
}
