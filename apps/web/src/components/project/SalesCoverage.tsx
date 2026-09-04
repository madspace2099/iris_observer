import { NO_CRM } from "@observer/metrics";
import type {
  PeriodPreset,
  ProjectCharts,
  ProjectSource,
  ProjectSummary,
  SourceKind,
} from "@observer/readmodels";

import { ChartFrame, Evidence, Unavailable } from "@/components/product";
import { BulletChart, JourneyFlow } from "@/showroom/charts2";
import { Plane } from "./Section";

/**
 * SALES COVERAGE — what is selling, how far a presentation gets, and which of
 * the four feeds is actually reporting.
 *
 * Three things a developer asks in one breath, and the third is what qualifies
 * the first two. Observer joins four sources no single system can see together
 * — WEBIRIS, the CRM, the IRIS showroom and the unit catalogue — and a figure
 * drawn from three of them while the fourth is silent is not wrong, it is
 * narrower than the reader thinks. An installation that stopped reporting on
 * Tuesday does not make a chart look broken; it makes it look finished.
 *
 * ## The unavailable statement is made ONCE for the region
 *
 * `docs/12-visual-autopsy.md` §9 records the defect this shape exists to avoid:
 * four panels in one viewport each repeating "The CRM is not connected". So a
 * disconnected feed produces exactly one `.ox-unavailable` band here, naming
 * what this screen cannot show and why, and every individual figure elsewhere
 * on the page carries only the terse missing mark. No band takes an action:
 * connecting a developer's CRM or a showroom installation is MADSPACE
 * administration, a separate surface with a different audience, and a control
 * that sent this reader there would be a control they cannot use.
 *
 * ## Sold against the plan is the one figure that turns a percentage into a
 * decision
 *
 * "33% sold" is neither good nor bad until the reader knows the schedule wanted
 * 41% by today. That is why `SalesTarget` carries `pace` and why the shape is a
 * bullet with a marker on the same axis rather than a ring or a percentage.
 *
 * ## `ProjectCharts` carries no evidence reference, and the screen says so
 *
 * Every other read model on this screen returns an `EvidenceRef`. `ProjectCharts`
 * returns `targets` and `journey` and nothing to check either against, so the
 * region's provenance line renders `Evidence evidence={null}`, which states **No
 * evidence** in words. An absent evidence line and a line nobody thought to add
 * look identical on a screenshot and only one of them is honest. Reported.
 */
export function SalesCoverage({
  charts,
  project,
  periodLabel,
  period,
}: {
  readonly charts: ProjectCharts;
  /** The project, for its four feeds and the locale its dates are read in. */
  readonly project: ProjectSummary;
  readonly periodLabel: string;
  readonly period: PeriodPreset;
}) {
  const missing = project.sources.filter((source) => !source.connected);
  const seenAt = new Intl.DateTimeFormat(project.locale, {
    dateStyle: "medium",
    timeZone: project.timeZone,
  });

  return (
    <Plane
      id="project-coverage"
      title="Sales coverage"
      note="Where the project stands against its own plan, how far a presentation gets, and which of the four feeds behind this screen is reporting."
      aside={<Evidence evidence={null} period={period} />}
    >
      {/*
       * One band per silent feed, and the CRM's sentence is the policy's own.
       *
       * `NO_CRM` is exported from `@observer/metrics` precisely so that three
       * screens cannot say "the CRM is not connected" three slightly different
       * ways and read as three different problems. The other three sentences
       * are not exported from the package root — `NO_WEBIRIS`, `NO_SHOWROOM`
       * and `NO_CATALOGUE` live beside `NO_CRM` and stop at the registry — so
       * they are stated generically here rather than copied, which would put a
       * second version of a policy sentence in the application. Reported.
       */}
      {missing.map((source) => (
        <Unavailable
          key={source.id}
          what={CANNOT_SHOW[source.kind]}
          why={
            source.kind === "crm"
              ? NO_CRM
              : `${FEED_WORDS[source.kind]} is not connected for this project.`
          }
          action={null}
          period={period}
        />
      ))}

      <ul className="ox-list" aria-label="Feeds behind this screen">
        {project.sources.map((source) => (
          <li className="ox-row" key={source.id}>
            <div>
              <p className="ox-row-name">{source.displayName}</p>
              <p className="ox-row-meta">
                <span>{FEED_WORDS[source.kind]}</span>
                <span>{lastHeard(source, seenAt)}</span>
              </p>
            </div>
            <div className="ox-row-states">
              <span className="ox-chip" data-tone={source.connected ? "good" : "none"}>
                <span className="ox-chip-mark" aria-hidden="true" />
                {source.connected ? "Reporting" : "Not connected"}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="ox-cols" data-cols="2">
        {charts.targets.length === 0 ? null : (
          <ChartFrame
            title="Sold against the plan"
            period={periodLabel}
            note="The bar is what has actually moved, the vertical mark is where the schedule wanted the project to be by today, and the outline is the target. A reservation is not a sale, so the two are counted separately."
            summary={charts.targets.map((target) => target.note).join(" ")}
          >
            <BulletChart
              rows={charts.targets.map((target) => ({
                id: target.id,
                label: target.label,
                actual: target.actual,
                target: target.target,
                pace: target.pace,
                total: target.total,
                note: target.note,
              }))}
            />
          </ChartFrame>
        )}

        {charts.journey.stages.length < 2 ? null : (
          <ChartFrame
            title="How far a presentation gets"
            period={periodLabel}
            note={charts.journey.note}
            summary={`${charts.journey.stages
              .map((stage) => `${stage.label}: ${stage.count}`)
              .join(". ")}. ${charts.journey.droppedLabel}.`}
          >
            <JourneyFlow stages={charts.journey.stages} links={charts.journey.links} />
          </ChartFrame>
        )}
      </div>

      {charts.targets.map((target) => (
        <p className="ox-section-note" key={target.id}>
          {target.label} · {target.note} Measured from {target.startedOn} against{" "}
          {target.targetDate}.
        </p>
      ))}
    </Plane>
  );
}

/**
 * When a feed was last heard from — and the sentence a feed that has never
 * spoken gets instead.
 *
 * `ProjectSource.lastSeenAt` is nullable and never zero-valued on purpose: a
 * source nobody has ever heard from has no last-seen instant, and writing the
 * epoch, the project's launch date or "now" would each be a fabricated
 * observation the reader could not tell from a real one. So the null is
 * rendered as words rather than as a date that does not exist.
 *
 * The instant is formatted in the PROJECT's locale and time zone rather than
 * the reader's. A showroom that went quiet at eleven at night went quiet at
 * eleven at night where it stands, and an agency reading the screen from
 * another country needs the fact about the room and not about their own desk.
 */
function lastHeard(source: ProjectSource, format: Intl.DateTimeFormat): string {
  if (source.lastSeenAt === null) {
    return source.connected ? "Connected, nothing received yet" : "Never reported";
  }
  return `Last heard from ${format.format(new Date(source.lastSeenAt))}`;
}

/**
 * The four feeds, in the words a reader would point at them with.
 *
 * `SourceKind` is a union of four machine tokens in
 * `packages/readmodels/src/context.ts` and nothing in the repository maps them
 * to display strings — `ProjectSource.displayName` names the installation
 * ("Main Showroom PC") and not what kind of thing it is. Reported as a gap,
 * beside the two others of exactly this shape on this screen.
 *
 * These are NOT `INSIGHT_SOURCE_LABELS`, and the difference matters enough to
 * write down: an `InsightSource` says what kind of FACT a claim rests on and is
 * rendered by `Sources` from the contracts package's own map, which is never
 * hand-written. A `SourceKind` says which SYSTEM is wired up. The two are
 * neighbours in the product and merging them would put "IRIS calculated" in a
 * list of things that can be offline.
 */
const FEED_WORDS: Readonly<Record<SourceKind, string>> = {
  webiris: "WEB IRIS",
  showroom: "IRIS showroom",
  crm: "CRM",
  catalogue: "Unit catalogue",
};

/** What this screen loses when a feed is silent, phrased as a region. */
const CANNOT_SHOW: Readonly<Record<SourceKind, string>> = {
  webiris: "Online demand before anybody walked in",
  showroom: "Everything IRIS observed in the room, and every figure below it",
  crm: "Reservation and purchase outcomes, and the plan they are counted against",
  catalogue: "The building, its units and every segment cut from them",
};
