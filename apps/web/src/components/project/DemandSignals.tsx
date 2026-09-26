import { AGENT_MIN_SAMPLE, insufficient } from "@observer/metrics";
import {
  DEFAULT_LANGUAGE,
  MEETINGS,
  type Language,
  type PeriodPreset,
  type PlaceInterest,
  type PluralForms,
  type ProjectView,
  type PulseSegment,
} from "@observer/readmodels";

import { ChartFrame, Evidence } from "@/components/product";
import { ParityScale } from "@/showroom/charts";
import { RankedBars } from "@/showroom/charts2";
import { counted, shareText } from "./Reading";
import { Plane } from "./Section";

/*
 * The words these charts count in. The Slovak and Hungarian forms are the ones
 * a count takes standing alone or as a subject; meetings are the shared
 * `MEETINGS`.
 */

export const DEMAND_MINUTES: PluralForms = {
  en: { one: "minute", other: "minutes" },
  sk: { one: "minúta", few: "minúty", other: "minút" },
  hu: { one: "perc", other: "perc" },
};

/**
 * WHERE THE ATTENTION GOES — demand read against supply, on four axes.
 *
 * The question a developer actually asks of a scheme is not "how many views"
 * but "are the flats we still have the flats people want". `PulseSegment`
 * answers it directly: `attentionIndex` is the segment's share of observed
 * attention divided by its share of inventory, so 1.00× is attention exactly
 * matching supply and everything else is a mismatch with a direction.
 *
 * That is why the shape is a parity scale rather than a bar chart. A bar from
 * zero answers "how big is this index", which is the wrong question; a marker
 * on an axis centred at parity answers "which side of parity, and by how far",
 * which is the one a pricing or marketing decision turns on.
 *
 * ## One chart per dimension, and the dimensions are the read model's
 *
 * `PulseSegment.dimension` is `rooms | orientation | floor_band | price_band`,
 * and the segments are grouped by it rather than drawn in one list, because
 * mixing "Two-room" and "South-facing" on one axis invites a reader to compare
 * two indices whose denominators are different slices of the same building.
 *
 * The order is fixed here and the CONTENT is not: a dimension the read model
 * returns nothing for is not drawn at all. Northgate's Pulse returns rooms,
 * orientation and floor bands and no price bands, so this screen shows three
 * axes on Northgate and would show four on a scheme that segments by price
 * without a line changing. Hard-coding the four would have drawn an empty
 * fourth chart on every project in the demonstration world.
 *
 * ## Below the sample floor there is no rank
 *
 * An index is a rank and a rank is a verdict. Below `AGENT_MIN_SAMPLE` this
 * region draws no scale and no ranked list at all, and says so in the policy's
 * own sentence — the raw presentation count is already stated in the building
 * tally above, which is the "show the figure, not the verdict" half of the rule.
 * A parity scale drawn from eleven meetings is the single most persuasive thing
 * this product could put on a screen and the least defensible.
 */
export function DemandSignals({
  segments,
  placeCategories,
  places,
  locale,
  periodLabel,
  meetingCount,
  evidence,
  period,
  language = DEFAULT_LANGUAGE,
}: {
  readonly segments: readonly PulseSegment[];
  readonly placeCategories: ProjectView["placeCategories"];
  readonly places: readonly PlaceInterest[];
  /** The project's locale. Every ratio on this screen is formatted against it. */
  readonly locale: string;
  readonly periodLabel: string;
  readonly meetingCount: number;
  readonly evidence: ProjectView["evidence"];
  readonly period: PeriodPreset;
  /** The words' language; the page passes the reader's once there is a choice. */
  readonly language?: Language;
}) {
  const belowFloor = meetingCount < AGENT_MIN_SAMPLE;
  const topCategories = placeCategories.slice(0, 7);
  const topPlaces = places.slice(0, 8);

  return (
    <Plane
      id="project-demand"
      title="Where the attention goes"
      note="Share of the meaningful views the Pulse recorded against a unit, divided by that part of the building's share of the stock. 1.00× is attention exactly matching supply; above it, more of the building's attention landed there than its size warrants. This counts openings of a unit, not time spent in a meeting — the segment below indexes the second, and the two figures are not interchangeable."
      aside={<Evidence evidence={evidence} period={period} />}
    >
      {belowFloor ? (
        <p className="ox-result">
          <span className="ox-chip" data-tone="watch">
            <span className="ox-chip-mark" aria-hidden="true" />
            Below the sample floor
          </span>
          <span>
            {insufficient(AGENT_MIN_SAMPLE, "meetings")} No index, no ranking and no ordering of the
            neighbourhood is drawn for this period; the presentations recorded so far are counted in
            the building tally above.
          </span>
        </p>
      ) : (
        <>
          <div className="ox-cols" data-cols="2">
            {DIMENSIONS.map((dimension) => {
              const rows = segments.filter((segment) => segment.dimension === dimension.id);
              if (rows.length === 0) return null;
              return (
                <ChartFrame
                  key={dimension.id}
                  title={dimension.title}
                  period={periodLabel}
                  note={dimension.note}
                  summary={rows
                    .map(
                      (row) =>
                        `${row.label}: ${row.attentionIndex.toFixed(2)} times its share of the building, ${row.available} still available`,
                    )
                    .join(". ")}
                >
                  <ParityScale
                    rows={rows.map((row) => ({
                      id: row.id,
                      label: row.label,
                      index: row.attentionIndex,
                      note: `${row.available} of these are still available`,
                    }))}
                  />
                </ChartFrame>
              );
            })}
          </div>

          {/*
           * WHAT BUYERS LOOKED AT AROUND THE BUILDING.
           *
           * The neighbourhood is a demand signal and a specifically
           * real-estate one: what a buyer lingers on outside the flat is the
           * argument they are buying, and it is the sharpest way to choose who
           * to contact when something in that category changes. Two readings
           * side by side because they answer different questions — one is the
           * KIND of place, which is a campaign; the other is the place itself,
           * which is a sentence in a viewing.
           */}
          {/*
           * The summary describes exactly the rows that are drawn, not the
           * whole list. An accessible summary is what a reader who cannot see
           * the plot is given INSTEAD of it, so a summary covering thirteen
           * categories beside a chart showing seven hands that reader a
           * different chart from everybody else's — and the six they alone were
           * told about are the six the sighted reader was spared.
           */}
          <div className="ox-cols" data-cols="2">
            {topCategories.length === 0 ? null : (
              <ChartFrame
                title="What kind of place holds them"
                period={periodLabel}
                note={`Share of all the time these meetings spent on any named place in the surroundings or the building, grouped by what kind of place it is. The ${topCategories.length} largest of ${placeCategories.length} kinds recorded.`}
                summary={topCategories
                  .map(
                    (category) =>
                      `${category.label}: ${shareText(category.share, locale)} of place time, reached in ${counted(category.meetings, MEETINGS, language)}`,
                  )
                  .join(". ")}
              >
                <RankedBars
                  period={period}
                  rows={topCategories.map((category) => ({
                    id: category.category,
                    label: category.label,
                    sub: `reached in ${counted(category.meetings, MEETINGS, language)}`,
                    value: category.share,
                    display: shareText(category.share, locale),
                  }))}
                />
              </ChartFrame>
            )}

            {topPlaces.length === 0 ? null : (
              <ChartFrame
                title="The places they stopped on"
                period={periodLabel}
                note={`Total time spent on one named place, summed across every meeting that opened it. The ${topPlaces.length} longest of ${places.length} places recorded. Amenities inside the building are recorded today; points of interest in the surroundings need a UE5 v2 event and are shown as a demonstration of what it would answer.`}
                summary={topPlaces
                  .map(
                    (place) =>
                      `${place.name}: ${counted(Math.round(place.totalDwellSeconds / 60), DEMAND_MINUTES, language)} across ${counted(place.meetings, MEETINGS, language)}`,
                  )
                  .join(". ")}
              >
                <RankedBars
                  period={period}
                  rows={topPlaces.map((place) => ({
                    id: place.placeId,
                    label: place.name,
                    sub: `${counted(place.meetings, MEETINGS, language)} · median ${place.medianDwellSeconds}s each`,
                    value: place.totalDwellSeconds,
                    display: `${Math.round(place.totalDwellSeconds / 60)}m`,
                  }))}
                />
              </ChartFrame>
            )}
          </div>
        </>
      )}
    </Plane>
  );
}

/**
 * The four axes a `PulseSegment` can be cut on, in the order a reader asks
 * about them: what size, which way it faces, how high, what it costs.
 *
 * The words are written here because `PulseSegment.dimension` is a union of
 * machine tokens and the read model carries no display string for it, and the
 * definition beside each one is what stops "1.32×" being a number the reader
 * has to take on trust. Reported as a gap: a dimension label belongs beside the
 * union that declares it, not in the seventh screen that renders it.
 */
const DIMENSIONS = [
  {
    id: "rooms",
    title: "By room count",
    note: "Attention on units of this size against their share of the building. A high index on a size that is nearly sold out is a supply problem; a high index on one that is not is a pricing question.",
  },
  {
    id: "orientation",
    title: "By orientation",
    note: "Attention on units facing this way against their share of the building. Aspect is the attribute buyers filter on first and the one a scheme can least change.",
  },
  {
    id: "floor_band",
    title: "By floor",
    note: "Attention on this band of the stack against its share of the building. The middle floors are where price meets view on most schemes, and this says whether that holds here.",
  },
  {
    id: "price_band",
    title: "By price band",
    note: "Attention on units in this band against their share of the building. Drawn only where the Pulse read model returns price bands for the project.",
  },
] as const satisfies readonly {
  readonly id: PulseSegment["dimension"];
  readonly title: string;
  readonly note: string;
}[];
