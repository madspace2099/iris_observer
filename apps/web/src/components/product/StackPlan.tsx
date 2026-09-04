import type { CSSProperties } from "react";
import Link from "next/link";
import type { PeriodPreset, PulseFloor, PulseUnit, UnitStatus } from "@observer/readmodels";

import { dynamicRoute } from "@/lib/href";
import { withPeriod } from "@/lib/period";

/**
 * The status, in a word.
 *
 * A state never reaches this screen as a colour or a border style alone. The
 * cell carries the shape; this carries the word, into the accessible name and
 * the hover title, because a stacking plan is exactly the surface where a
 * reader would otherwise be asked to learn a legend by heart.
 */
const STATUS_WORDS: Readonly<Record<UnitStatus, string>> = {
  available: "available",
  reserved: "reserved",
  sold: "sold",
};

/**
 * What happened to this unit inside the period, where anything did.
 *
 * `PulseUnit.change` is null on most cells, which is what makes the ones that
 * are not null worth reading. The stylesheet has no mark for it yet, so it is
 * carried in the cell's name and title rather than invented as a colour — see
 * the gap noted at the foot of this docblock.
 */
const CHANGE_WORDS: Readonly<Record<NonNullable<PulseUnit["change"]>, string>> = {
  sold: "sold in this period",
  reserved: "reserved in this period",
  price_cut: "price reduced in this period",
  demand_drop: "fewer views than the period before",
  new_interest: "first views in this period",
};

const TREND_WORDS: Readonly<Record<PulseUnit["trend"], string>> = {
  rising: "rising",
  flat: "flat",
  falling: "falling",
};

/**
 * THE BUILDING. The one component that makes this product read as real estate.
 *
 * The final test of every Observer screen is that with the logo hidden it still
 * reads as real-estate spatial sales intelligence rather than as a generic
 * analytics dashboard. Charts do not pass that test; a stacking plan does. A
 * floor is a row, top floor first because that is how the building stands. A
 * unit is a cell, as wide as its floor area is large. Its fill is how much
 * attention buyers gave it in the period, and its edge is whether it is still
 * for sale.
 *
 * Everything drawn here comes from the unit catalogue and from observed
 * interest. `ProjectPulse` is explicit that nothing in it is invented for the
 * picture, and this component adds nothing: no smoothing, no ranking, no
 * synthetic floor to make the silhouette pleasant. It is the building.
 *
 * ## Three channels, three different visual properties, on purpose
 *
 * **Width is area.** A quantity a reader already understands spatially, mapped
 * to the one dimension a row of cells has spare. It also makes the plan look
 * like the building rather than like a bar chart with rounded corners.
 *
 * **Fill is attention**, as a luminance ramp on ONE hue, fed to the stylesheet
 * through `--ox-heat` between 0 and 1. Never a rainbow: a sequential quantity
 * rendered as a categorical palette is the most common lie in charting, and
 * `PulseUnit.attention` is already normalised against the busiest unit in the
 * project, so the ramp has a denominator.
 *
 * **The edge is status.** Dashed for reserved, hatched with a disabled border
 * for sold. Shape rather than hue, so the plan survives a greyscale print and a
 * reader who cannot separate the two colours.
 *
 * ## Why a sold unit carries no heat
 *
 * The sheet paints `[data-heat]` after `[data-status="sold"]` at equal
 * specificity, so a heat value on a sold cell would replace the hatch that is
 * the only thing marking it as sold. Between "how much attention did this
 * already-sold unit get" and "is this unit still for sale", the second is the
 * question a reader is actually asking of a stacking plan, so sold cells are
 * drawn without a heat value and say so in the legend. Their attention figure
 * is still in the cell's accessible name and is not lost.
 *
 * ## Why every cell is a link
 *
 * A Pulse that drives nothing has failed and should be deleted — the read model
 * says so in its own words. The cell is the drill-down: it is how a reader gets
 * from "that one is bright" to the unit's own surface. A unit with no route in
 * `unitHrefs` is drawn as a plain cell rather than as a link to nowhere.
 *
 * ## Gaps reported to the design system
 *
 * `.ox-stack-unit` has no hook for `PulseUnit.change` or for `intent`, and no
 * hook for area — the width is set with an inline `flex-grow`/`flex-basis`
 * because the sheet declares only a `min-width`. A `--ox-area` custom property
 * consumed as `flex-grow: var(--ox-area)`, and a `data-change` treatment,
 * would remove both compromises.
 */
export function StackPlan({
  floors,
  unitHrefs,
  period,
  buildingLabel,
  peakViews = null,
}: {
  /** Top floor first, as `ProjectPulse.floors` already orders them. */
  readonly floors: readonly PulseFloor[];
  /**
   * Where each unit's own surface is, keyed by `unitId`.
   *
   * A resolved map rather than a function, following `UnitMatrix`: a function
   * prop cannot cross into a client component, and a primitive that is
   * server-only today but composed into a client surface tomorrow is a
   * primitive that breaks at the boundary rather than at the call site.
   */
  readonly unitHrefs: Readonly<Record<string, string>>;
  readonly period: PeriodPreset;
  /** What this building is called. Becomes the plan's accessible name. */
  readonly buildingLabel: string;
  /**
   * Meaningful views on the busiest unit — the denominator the fill ramp is
   * normalised against. Stated in the legend when the caller has it, because a
   * luminance with no scale is a decoration.
   */
  readonly peakViews?: number | null;
}) {
  return (
    <div>
      <div className="ox-stack" role="group" aria-label={`${buildingLabel}, stacking plan`}>
        <p className="ox-sr">
          One row per floor, the top floor first. Each cell is a unit; its width is its floor area
          and its fill is how much buyer attention it drew in this period.
        </p>

        {floors.map((floor) => (
          <div className="ox-stack-floor" key={floor.floor}>
            <span className="ox-stack-label">{floor.label}</span>
            <div className="ox-stack-units">
              {floor.units.map((unit) => (
                <Cell
                  key={unit.unitId}
                  unit={unit}
                  href={unitHrefs[unit.unitId] ?? null}
                  period={period}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <ul className="ox-stack-key">
        <li>Row · one floor, top floor first</li>
        <li>Cell width · floor area</li>
        <li>
          Brighter fill · more meaningful views in this period
          {peakViews === null ? "" : `, against ${peakViews} on the busiest unit`}
        </li>
        <li>Dashed edge · reserved</li>
        <li>Hatched · sold, and drawn without a fill</li>
      </ul>
    </div>
  );
}

/**
 * One unit.
 *
 * The accessible name is long on purpose. This is the one surface where the
 * product is a building rather than a report, and a reader using a screen
 * reader gets the building only through these names: the code, where it is,
 * what it is, which way it faces, what it costs, whether it is still for sale,
 * and how much attention it drew. Splitting that across a `title` and a
 * shorter label would leave that reader with a grid of unit codes.
 */
function Cell({
  unit,
  href,
  period,
}: {
  readonly unit: PulseUnit;
  readonly href: string | null;
  readonly period: PeriodPreset;
}) {
  const sold = unit.status === "sold";

  /*
   * `--ox-heat` as a value, which is how this system is designed to be fed.
   * `flex-grow` and `flex-basis` are inline because the sheet gives the cell a
   * `min-width` and nothing else; see the gap noted on the component above.
   */
  const style = {
    flexGrow: unit.areaSqm,
    flexBasis: 0,
    ...(sold ? {} : { "--ox-heat": unit.attention.toFixed(3) }),
  } as CSSProperties;

  const change = unit.change === null ? null : CHANGE_WORDS[unit.change];
  const name = [
    `${unit.code}, floor ${unit.floor}, block ${unit.block}`,
    `${unit.rooms} rooms, ${unit.areaSqm} square metres, facing ${unit.orientation}`,
    unit.priceDisplay,
    STATUS_WORDS[unit.status],
    `${unit.meaningfulViews} meaningful views from ${unit.uniqueContacts} people, ${TREND_WORDS[unit.trend]}`,
    ...(change === null ? [] : [change]),
  ].join(" · ");

  const attributes = {
    className: "ox-stack-unit",
    "data-status": unit.status,
    ...(sold ? {} : { "data-heat": unit.attention.toFixed(3) }),
    style,
    title: name,
    /*
     * The name is an attribute rather than hidden text inside the cell. A cell
     * is 22px tall and holds no content; a visually hidden child would be
     * correct too, and `aria-label` keeps the element genuinely empty so the
     * fill is never pushed out of shape by a stray text node.
     */
    "aria-label": name,
  };

  if (href === null) {
    /*
     * No route, so no link. A cell that looked like every other cell and did
     * nothing when pressed is the control-that-does-nothing the doctrine
     * forbids, and it is worse here than anywhere because its neighbours do
     * navigate. `role="img"` gives the empty element a name it would otherwise
     * not be permitted to carry.
     */
    return <span {...attributes} role="img" />;
  }

  return <Link {...attributes} href={dynamicRoute(withPeriod(href, period))} />;
}
