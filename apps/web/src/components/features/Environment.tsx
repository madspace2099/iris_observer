import type { EnvironmentUsage, PeriodPreset } from "@observer/readmodels";

import { ChartFrame, DataTable, Sources, type DataRow } from "@/components/product";
import { RankedBars } from "@/showroom/charts2";
import { Count } from "./Reading";

/**
 * One preset family, as a chart or as a register.
 *
 * The same counts either way. Which of the two is drawn is decided by the
 * screen and turns on the sample: an ordered bar chart IS a rank, and below the
 * minimum sample this product does not rank. The register carries the identical
 * figures in the read model's own order and makes no claim about which preset
 * is chosen most.
 */
function Presets({
  title,
  note,
  periodLabel,
  entries,
  ranked,
  period,
  caption,
  emptyNote,
}: {
  readonly title: string;
  readonly note: string;
  readonly periodLabel: string;
  readonly entries: readonly { readonly label: string; readonly count: number }[];
  readonly ranked: boolean;
  readonly period: PeriodPreset;
  readonly caption: string;
  readonly emptyNote: string;
}) {
  if (entries.length === 0) {
    return (
      <DataTable
        caption={caption}
        columns={[
          { key: "preset", label: "Setting" },
          { key: "changes", label: "Changes", numeric: true },
        ]}
        rows={[]}
        codeColumn="preset"
        period={period}
        empty={{ title: `${title}: nothing recorded`, note: emptyNote }}
      />
    );
  }

  if (!ranked) {
    const rows: readonly DataRow[] = entries.map((entry) => ({
      key: entry.label,
      cells: { preset: entry.label, changes: <Count n={entry.count} /> },
    }));
    return (
      <DataTable
        caption={caption}
        columns={[
          { key: "preset", label: "Setting" },
          { key: "changes", label: "Changes", numeric: true },
        ]}
        rows={rows}
        codeColumn="preset"
        period={period}
        empty={null}
      />
    );
  }

  /*
   * Ordered here rather than upstream.
   *
   * `getStorytelling` returns the presets in the order it first met them, which
   * is an artefact of iteration and not a statement about anything. A bar chart
   * whose bars are in an arbitrary order invites the reader to read the order,
   * so the rows are sorted by count — and the whole chart is only drawn where
   * the sample supports a rank at all.
   */
  const ordered = [...entries].sort((a, b) => b.count - a.count);

  return (
    <ChartFrame
      title={title}
      period={periodLabel}
      note={note}
      summary={`${title}, by number of changes: ${ordered
        .map((entry) => `${entry.label} ${entry.count}`)
        .join(", ")}.`}
    >
      <RankedBars
        rows={ordered.map((entry) => ({
          id: entry.label,
          label: entry.label,
          sub: null,
          value: entry.count,
          display: String(entry.count),
        }))}
      />
    </ChartFrame>
  );
}

/**
 * TIME AND WEATHER — the one feature that changes the building rather than the
 * screen.
 *
 * The environment control is a section of the presentation like any other, and
 * it is also the only one that alters what the buyer is looking at: the same
 * apartment at golden hour and in fog is the same apartment making two
 * different arguments about its aspect. That is why it gets a region rather
 * than three columns in the register.
 *
 * ## The unit of these counts is a CHANGE, not a presentation
 *
 * A presentation that moved the light four times contributes four. The two
 * denominators are therefore different questions and both are stated: the
 * sentence above the charts counts PRESENTATIONS that touched the control at
 * all, out of every presentation in the period; the charts count CHANGES. The
 * total number of changes is not published by the read model, so no share of
 * changes is shown — a percentage whose denominator the screen does not hold is
 * a figure nobody can check, and the counts stand on their own.
 *
 * ## What "changed while on screen" does and does not say
 *
 * The last register records which feature was open at the moment the preset was
 * changed. It is a sequence, recorded, and nothing more: it does not say the
 * feature prompted the change, and the note says so. What the current build
 * cannot record at all is which UNIT was on screen, which is the question a
 * developer actually wants answered about aspect, and that absence is stated
 * with the rest of them at the foot of the screen.
 */
export function Environment({
  environment,
  period,
  periodLabel,
  ranked,
}: {
  readonly environment: EnvironmentUsage;
  readonly period: PeriodPreset;
  readonly periodLabel: string;
  /** Whether the sample supports an ordered reading. Decided by the screen. */
  readonly ranked: boolean;
}) {
  const duringRows: readonly DataRow[] = environment.duringSections.map((during) => ({
    key: during.sectionId,
    cells: { feature: during.label, changes: <Count n={during.count} /> },
  }));

  return (
    <>
      <p className="ox-section-note">
        {environment.meetingsUsingEnvironment} of the {environment.meetingsTotal} presentations
        recorded in this period changed the time of day or the weather at least once. The counts
        below are changes, not presentations: one presentation that moved the light four times
        appears four times.
      </p>

      <div className="ox-cols" data-cols="2">
        <Presets
          title="Time of day chosen"
          note="Every time-of-day preset the presenter selected, counted as changes across the period. Presets nobody selected do not appear."
          periodLabel={periodLabel}
          entries={environment.timeOfDay}
          ranked={ranked}
          period={period}
          caption={`Time-of-day presets selected in the showroom, ${periodLabel}.`}
          emptyNote="No presentation changed the time of day in this period. The control was available and nobody used it, which is an answer rather than a gap."
        />
        <Presets
          title="Weather chosen"
          note="Every weather preset the presenter selected, counted as changes across the period. Presets nobody selected do not appear."
          periodLabel={periodLabel}
          entries={environment.weather}
          ranked={ranked}
          period={period}
          caption={`Weather presets selected in the showroom, ${periodLabel}.`}
          emptyNote="No presentation changed the weather in this period. The control was available and nobody used it, which is an answer rather than a gap."
        />
      </div>

      <DataTable
        caption={`Which feature was on screen when the light or the weather was changed, ${periodLabel}. A recorded sequence: the feature was open, and then the setting moved.`}
        columns={[
          { key: "feature", label: "Feature on screen" },
          { key: "changes", label: "Changes made there", numeric: true },
        ]}
        rows={duringRows}
        codeColumn="feature"
        period={period}
        empty={{
          title: "No setting change was tied to a feature",
          note: "The showroom recorded no feature on screen at the moment a preset was changed in this period.",
        }}
      />

      <div className="ox-finding-foot">
        <Sources sources={["IRIS_SHOWROOM_OBSERVED"]} />
      </div>
    </>
  );
}
