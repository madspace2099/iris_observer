"use client";

import { useState } from "react";
import { INSIGHT_SOURCE_LABELS } from "@observer/contracts";
import { defineMeasurement, type MeasurementIcon } from "@observer/readmodels";

/**
 * A column header that explains itself.
 *
 * Abbreviated headers — `MTGS`, `MED S`, `CMP` — save four characters and cost
 * the reader the meaning of the whole column. Here each measurement gets a
 * monoline glyph, its full name, and an info control that opens a real
 * explanation: what it measures, how it is computed, where it came from, and
 * what it does not say.
 *
 * The explanation opens in place rather than as a hover tooltip, because a
 * tooltip cannot be read twice, cannot be reached from a keyboard comfortably,
 * and does not exist on a touch screen.
 */

const PATHS: Record<MeasurementIcon, string> = {
  meetings: "M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5M12 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z",
  clock: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM12 8v4.2l2.8 2",
  star: "m12 4 2.4 5 5.6.8-4 4 .9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-4 5.6-.8L12 4Z",
  plan: "M5 4h9l5 5v11H5V4ZM14 4v5h5M8 13h8M8 17h5",
  compare: "M8 6H4v12h4M16 6h4v12h-4M12 3v18",
  trend: "M4 16.5 10 10l3.5 3.5L20 6M20 6h-4.5M20 6v4.5",
  eye: "M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12ZM12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z",
  camera: "M4 8h3l1.5-2h7L17 8h3v11H4V8ZM12 10.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z",
  share: "M14 5h5v5M19 5l-7.5 7.5M17 14v5H5V7h5",
  balcony: "M4 11h16M6 11V6h12v5M6 11v9M18 11v9M10 14v6M14 14v6",
  layers: "m12 3 8 4.5-8 4.5-8-4.5L12 3ZM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5",
  coverage: "M12 3.5A8.5 8.5 0 1 1 3.5 12M12 3.5V12l6 6",
  depth: "M4 6h16M4 12h11M4 18h6",
  sequence: "M4 12h4l2-5 3 10 2.5-5H20",
  sun: "M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  cloud: "M7 18h9.5a3.5 3.5 0 0 0 .3-7A5.5 5.5 0 0 0 6.4 12 3 3 0 0 0 7 18Z",
  link: "M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.4 6.2M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.2-1.2",
};

export function MeasureIcon({ name }: { name: MeasurementIcon }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Measure({
  id,
  align = "left",
}: {
  id: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const definition = defineMeasurement(id);

  if (definition === undefined) return <span>{id}</span>;

  return (
    <span className="iris-measure" data-align={align}>
      <MeasureIcon name={definition.icon} />
      <span className="iris-measure-label">{definition.columnLabel ?? definition.label}</span>
      <button
        type="button"
        className="iris-measure-info"
        aria-expanded={open}
        aria-label={`What ${definition.label} measures`}
        onClick={() => setOpen(!open)}
      >
        i
      </button>

      {open ? (
        <span className="iris-measure-panel" role="note">
          <b>{definition.label}</b>
          <span>
            <em>What it measures</em>
            {definition.whatItMeasures}
          </span>
          <span>
            <em>How it is computed</em>
            {definition.howItIsComputed}
          </span>
          <span>
            <em>What it does not say</em>
            {definition.limitation}
          </span>
          <span className="iris-srcs">
            {definition.sources.map((source) => (
              <span className="iris-src" key={source} data-src={source}>
                {INSIGHT_SOURCE_LABELS[source]}
              </span>
            ))}
          </span>
        </span>
      ) : null}
    </span>
  );
}
