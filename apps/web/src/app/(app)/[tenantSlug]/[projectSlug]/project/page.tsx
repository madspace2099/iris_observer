import type { Metadata } from "next";
import Link from "next/link";
import { nothingReceivedYet, type PeriodPreset, DEFAULT_LANGUAGE } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom, withPeriod } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Finding, Gaps, SourceChips } from "@/showroom/parts";
import { DrawIn } from "@/showroom/DrawIn";
import { SpokenVerdict } from "@/components/iris/SpokenVerdict";
import { InfoTip } from "@/components/iris/InfoTip";
import { ExportReport } from "@/components/report";
import { SalesPlanBlock } from "@/components/project-plan/SalesPlanBlock";
import { RoomTypes } from "@/components/project/RoomTypes";
import { RoomReadings } from "@/components/project/RoomReadings";
import { RoomCompare } from "@/components/project/RoomCompare";
import { PresentationPath } from "@/components/project/PresentationPath";
import { ScreenRail, type Screen } from "@/components/screens/ScreenRail";
import "@/components/project/project-screens.css";

export const metadata: Metadata = { title: "Project" };

/**
 * View two — what buyers want, and what they linger on.
 *
 * Three questions, in the order a developer asks them.
 *
 * **Which flat types sell, and which do buyers ask for?** The catalogue's room
 * types side by side (ADR-0056): how many flats of each and how many sold, the
 * share of meetings that opened each over a window the reader switches in
 * place, a reading of interest against sales in words, and what buyers did
 * with each type once they opened one — the types as columns, never as tabs.
 *
 * **What did they search for that we do not have?** A filter with no matching
 * unit is the sharpest demand signal a project gets, and the only one that names
 * something the building lacks. It needs a UE5 v2 event, and the page says so.
 *
 * **One screen at a time** (the owner, 2026-10-23, ADR-0063): Sales Flow's and
 * Sales Agents' screens (ADR-0059, ADR-0061) on this page too. Each block below
 * is a `.screen` as tall as the viewport under the sticky chrome, its drawing
 * sized to it (`project-screens.css`), and the shared rail says where you are.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "project", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const query = {
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
    language: DEFAULT_LANGUAGE,
  };

  /* The room types’ every window of interest arrives at once, so the switch needs no request (ADR-0056). */
  const [view, charts, report, roomTypes] = await Promise.all([
    /* No segment is selected: the room types stand side by side (ADR-0056). */
    repository.getProjectView(query, null),
    repository.getProjectCharts(query),
    repository.getReportScope(query),
    repository.getRoomTypes(query),
  ]);
  const reportHref = withPeriod(`/${tenantSlug}/${projectSlug}/report`, query.period);

  const crm = view.context.project.connectedSources.includes("crm");
  const unmet = view.demand.filter((d) => d.matches === 0);
  /*
   * The search register's two count heads, each built once: the column head
   * on a desk, and every cell's `data-label` on a phone, where the head is
   * hidden and the record layout paints the label in front of the number.
   * Two literals drifted apart - the head learnt the set, the label kept the
   * short word, and a count stood without its set on the one view nobody
   * had photographed.
   */
  const applicationsHead = `Times applied, of ${view.meetingCount} presentations`;
  const matchesHead = `Units matching, of ${view.availableUnits} available now`;
  const peakPlace = view.places[0]?.totalDwellSeconds ?? 1;

  /*
   * THE FIRST DAY OF A PROJECT MADE IN ADMINISTRATION.
   *
   * Nothing has arrived and nothing is connected, so every frame below would be
   * its own way of saying so: two unavailable bars, an empty scale, four empty
   * quadrants and three tables of headings. That is a page of absences a reader
   * has to add up. It is one fact, so it is said once: what this project waits
   * for, feed by feed, in the names administration gave them. The ordinary page
   * returns the moment any one of them delivers.
   */
  if (
    nothingReceivedYet(view.context) !== null &&
    view.context.project.connectedSources.length === 0
  ) {
    return (
      <div className="iris-one">
        <section className="iris-plane iris-stack">
          <p className="iris-kicker iris-kicker-measured">Project · {view.context.period.label}</p>
          <SpokenVerdict
            sentence={view.verdict}
            meetings={view.meetingCount}
            locale={view.context.project.locale}
            replay={query.period}
          />
          <p className="iris-body" style={{ maxWidth: "62ch" }}>
            This project shows only what its own sources deliver, and none has delivered yet.
            MADSPACE connects them, and each screen fills as its source starts to report.
          </p>
          <Gaps
            title="What this project is waiting for"
            gaps={view.context.project.sources.map(
              (source) => `${source.displayName}: not connected yet.`,
            )}
          />
        </section>
      </div>
    );
  }

  /*
   * THE SCREENS, IN THE PAGE'S ORDER (ADR-0063). Without a unit catalogue the
   * three room-type screens would each be one sentence on a black field, so
   * that sentence closes the plan's screen instead and they are not listed.
   */
  const types = view.segments.length > 0;
  const screens: readonly Screen[] = [
    { id: "project-verdict", label: "The verdict" },
    { id: "project-plan", label: "Sold against the plan" },
    ...(types
      ? [
          { id: "project-types", label: "Flat types" },
          { id: "project-readings", label: "Interest against sales" },
          { id: "project-compare", label: "The room types side by side" },
        ]
      : []),
    { id: "project-search", label: "What buyers searched for" },
    { id: "project-path", label: "How far the presentations got" },
    { id: "project-findings", label: "What this period found" },
  ];

  return (
    /* `pr-page`: this page's own rules in `rooms.css` (a title's `i` keeps its line). */
    <div className="iris-one pr-page iris-screens">
      <section className="iris-plane iris-stack">
        {/* The verdict is the first screen, with the page's ways on under it. */}
        <div className="screen" id="project-verdict">
          <p className="iris-kicker iris-kicker-measured">Project · {view.context.period.label}</p>
          <SpokenVerdict
            sentence={view.verdict}
            meetings={view.meetingCount}
            locale={view.context.project.locale}
            replay={query.period}
          />

          {/*
           * PRESENTATION DNA, REACHABLE FROM ITS OWNING CONTEXT.
           *
           * It used to be a tab shown on Sales Flow and Sales Agents, sections it
           * does not belong to — see the docblock in Shell.tsx's `rowFor`. What
           * it measures is how THIS project's own presentations differ from one
           * another, so this is where it belongs: a plain link rather than
           * styled prose, because this page is converted onto the current
           * system in full shortly and a legacy sheet is not worth designing
           * for twice.
           *
           * `.iris-action` is `white-space: nowrap` by design — it is a pill,
           * not a sentence — so the label stays as short as the "Build an
           * audience from this" pill already on this page, rather than the full
           * sentence a first pass gave it, which held its line past 390px.
           */}
          <p className="iris-meta iris-actions">
            <Link
              className="iris-action"
              href={dynamicRoute(
                withPeriod(`/${tenantSlug}/${projectSlug}/presentation`, query.period),
              )}
            >
              Presentation DNA →
            </Link>
            {/*
             * THE REPORT, REACHED FROM THE SCREEN WHOSE FIGURES IT PRINTS.
             *
             * The page is the document (M4's internal sales-intelligence
             * report, drawn rather than generated), and the dialog beside it
             * is where a reader sees which sections it would carry before
             * opening it. Both mount here because Project is the scope they
             * describe; Meeting Detail will mount the same dialog for one
             * meeting once the port can answer for one.
             */}
            <Link className="iris-action" href={dynamicRoute(reportHref)}>
              Report →
            </Link>
            <ExportReport language={view.context.language} report={report} pageHref={reportHref} />
          </p>
        </div>

        {/* --- the plan, and where the project stands against it (ADR-0055) --- */}

        <div className="screen" id="project-plan">
          {/* Each card's marks grow in as it comes into view (ADR-0062). */}
          <DrawIn kind="fill" key={`plan-${query.period}`}>
            <SalesPlanBlock
              plan={charts.plan}
              role={viewer.role}
              tenant={view.context.tenant}
              tenantSlug={tenantSlug}
              projectSlug={projectSlug}
              crmConnected={view.context.project.connectedSources.includes("crm")}
            />
          </DrawIn>

          {/*
           * THE ROOM TYPES, SIDE BY SIDE (ADR-0056). Every block after this
           * counts, sells or compares the catalogue's flats by room count. With
           * no catalogue there is no type to draw, and that is one sentence.
           */}
          {types ? null : (
            <div>
              <h2 className="iris-kicker iris-kicker-measured">Flat types</h2>
              <p className="iris-meta" style={{ marginTop: ".5rem", maxWidth: "70ch" }}>
                Unavailable — no unit catalogue has reached this project, so there are no flat types
                to count, sell or compare.
              </p>
            </div>
          )}
        </div>

        {types ? (
          <>
            <div className="screen" id="project-types">
              <DrawIn kind="fill">
                <RoomTypes view={roomTypes}>
                  <SourceChips
                    sources={
                      crm
                        ? ["IRIS_SHOWROOM_OBSERVED", "CRM_OUTCOME_CONTEXT"]
                        : ["IRIS_SHOWROOM_OBSERVED"]
                    }
                  />
                </RoomTypes>
              </DrawIn>
            </div>

            <div className="screen" id="project-readings">
              <DrawIn kind="fill">
                <RoomReadings view={roomTypes}>
                  <SourceChips
                    sources={
                      crm
                        ? ["IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]
                        : ["IRIS_SHOWROOM_DERIVED"]
                    }
                  />
                </RoomReadings>
              </DrawIn>
            </div>

            <div className="screen" id="project-compare">
              <DrawIn kind="fill">
                <RoomCompare view={roomTypes} hrefFor={(href) => withPeriod(href, query.period)}>
                  <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} />
                </RoomCompare>
              </DrawIn>
            </div>
          </>
        ) : null}

        {/*
         * What buyers looked for, and where: the searches beside the kinds of
         * place, the named places under both. One screen, since each alone is
         * a list too short to hold a screen.
         */}
        <div className="screen" id="project-search">
          <div className="iris-band">
            <div>
              <h2 className="iris-kicker iris-kicker-measured" style={{ marginBottom: ".75rem" }}>
                What buyers searched for
              </h2>
              <div className="iris-matrix pr-search" data-columns="demand">
                <div className="iris-matrix-head">
                  <span>Filter</span>
                  <span>Value</span>
                  {/* The column head is beside every figure in the column: the set is stated once, visibly. */}
                  <span style={{ textAlign: "right" }}>{applicationsHead}</span>
                  <span style={{ textAlign: "right" }}>{matchesHead}</span>
                </div>
                {view.demand.slice(0, 10).map((d) => (
                  <div
                    className="iris-matrix-row"
                    key={`${d.field}-${d.value}`}
                    data-empty={d.matches === 0 ? "true" : undefined}
                  >
                    <span className="iris-bar-label" title={d.label} data-label="Filter">
                      {d.label}
                    </span>
                    <span className="iris-bar-label" title={d.value} data-label="Value">
                      {d.value}
                    </span>
                    <span className="iris-matrix-num" data-label={applicationsHead}>
                      {d.applications}
                    </span>
                    <span
                      className="iris-matrix-num"
                      data-zero={d.matches === 0 ? "true" : undefined}
                      data-label={matchesHead}
                    >
                      {d.matches}
                    </span>
                  </div>
                ))}
              </div>
              {unmet.length === 0 ? null : (
                <p className="iris-finding-caveat" style={{ marginTop: ".75rem" }}>
                  {unmet.length} of these searches matched no available unit at all.
                </p>
              )}
            </div>

            <div className="iris-band-side d-card" key={`places-${query.period}`}>
              <header className="iris-titled" style={{ marginBottom: ".75rem" }}>
                <h2 className="iris-kicker iris-kicker-measured">
                  What the neighbourhood is doing
                </h2>
                <InfoTip id="neighbourhood" label="what the neighbourhood is doing">
                  Each bar is a kind of place: its share of all the time buyers spent on named
                  places in this period. The longest bar is the kind they spent most time on.
                </InfoTip>
              </header>
              <DrawIn kind="sweep">
                <div className="iris-bars pr-bars">
                  {view.placeCategories.slice(0, 7).map((c) => (
                    <div className="iris-bar" key={c.category}>
                      <span className="iris-bar-label" title={c.label}>
                        {c.label}
                      </span>
                      <span
                        className="iris-bar-track"
                        style={
                          {
                            "--v": (c.share / (view.placeCategories[0]?.share ?? 1)).toFixed(3),
                          } as React.CSSProperties
                        }
                      >
                        <i />
                      </span>
                      <span className="iris-bar-value">{c.shareDisplay}</span>
                    </div>
                  ))}
                </div>
              </DrawIn>
              <p className="pr-note" style={{ marginTop: ".625rem" }}>
                Share of the time spent on named places.
              </p>
            </div>
          </div>

          <div>
            <header className="iris-titled" style={{ marginBottom: ".75rem" }}>
              <h2 className="iris-kicker iris-kicker-measured">The places buyers stopped on</h2>
              <InfoTip id="places" label="the places buyers stopped on">
                Ordered by total time, in minutes. Amenities inside the building are recorded today;
                places in the neighbourhood are shown as a demonstration until the showroom records
                them.
              </InfoTip>
            </header>
            <div className="iris-places">
              {view.places.map((p) => (
                <span
                  className="iris-place"
                  key={p.placeId}
                  data-section={p.section}
                  style={
                    { "--w": (p.totalDwellSeconds / peakPlace).toFixed(3) } as React.CSSProperties
                  }
                  title={`${p.meetings} meetings · median ${p.medianDwellSeconds}s${
                    p.availability === "requires_ue5_v2_event" ? " · needs a UE5 v2 event" : ""
                  }`}
                >
                  {p.name}
                  <b>{Math.round(p.totalDwellSeconds / 60)}m</b>
                </span>
              ))}
            </div>
            <SourceChips sources={["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]} />
          </div>
        </div>

        {/*
         * HOW FAR THE PRESENTATIONS GOT (ADR-0041, ADR-0056): one narrowing
         * path whose title states the set and whose every band says what it
         * is. The bands, their shares and their notes are the read model's.
         */}
        <div className="screen" id="project-path">
          <PresentationPath
            key={`journey-${query.period}`}
            funnel={charts.journey.funnel}
            note={charts.journey.note}
          >
            {/* "Progressed" is drawn only from outcomes a CRM recorded. */}
            <SourceChips
              sources={
                crm
                  ? ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED", "CRM_OUTCOME_CONTEXT"]
                  : ["IRIS_SHOWROOM_OBSERVED", "IRIS_SHOWROOM_DERIVED"]
              }
            />
          </PresentationPath>
        </div>

        <div className="screen" id="project-findings">
          {/* The findings' citations at the 12px floor, on this page only (rooms.css). */}
          <div className="pr-findings">
            {view.findings.map((finding, index) => (
              <Finding
                key={finding.id}
                finding={finding}
                period={query.period}
                lead={index === 0}
                plane
              />
            ))}
          </div>

          {/* Said plainly, without the build's vocabulary, for the screen (2026-10-23). */}
          <Gaps
            gaps={[
              "Search filters and named places in the neighbourhood are demonstration values until the showroom records them.",
              "Time spent on a kind of place is a behaviour, not a fact about anyone's household.",
            ]}
          />
        </div>
      </section>
      {/*
       * After the screens in the DOM, so Tab reaches the page's own controls
       * first (ADR-0061); drawn beside them. Keyed on the period, as the
       * screens' contents are, so its observer follows them.
       */}
      <ScreenRail key={`rail-${query.period}`} screens={screens} label="Project screens" />
    </div>
  );
}
