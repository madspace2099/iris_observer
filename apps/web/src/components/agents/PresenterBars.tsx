import {
  seatSeries,
  type PeriodPreset,
  type RankedRow,
  type TenantSummary,
} from "@observer/readmodels";

import { portraitSources } from "@/lib/portraits/server";
import { RankedBars } from "@/showroom/charts2";

import { AgentPortrait } from "./Portrait";

/** Each agent's seat colour, from the read model's seat order (`seatSeries`). */
export function seatTones(seatOrder: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(seatOrder.map((id, i) => [id, `var(--d-series-${seatSeries(i)})`]));
}

/**
 * "PRESENTATIONS GIVEN", WITH A FACE TO EACH NAME (ADR-0054).
 *
 * The same ranked list as before — workload, never outcome — with each agent's
 * portrait, or initials, before the name. The name stands beside it, so the
 * picture's text alternative is empty.
 */
export async function PresenterBars({
  rows,
  period,
  tenant,
  projectSlug,
  seatOrder,
  measured = false,
}: {
  readonly rows: readonly RankedRow[];
  readonly period: PeriodPreset;
  readonly tenant: Pick<TenantSummary, "id" | "slug">;
  readonly projectSlug: string;
  /** Agent ids in seat order, so a face is ringed in the colour its charts wear. */
  readonly seatOrder: readonly string[];
  readonly measured?: boolean;
}) {
  const sources = await portraitSources(
    tenant,
    projectSlug,
    rows.map((row) => row.id),
  );
  const tones = seatTones(seatOrder);
  const marks = Object.fromEntries(
    rows.map((row) => [
      row.id,
      <AgentPortrait
        key={row.id}
        name={row.label}
        src={sources[row.id] ?? null}
        tone={tones[row.id]}
        size="row"
        alt=""
      />,
    ]),
  );
  return <RankedBars rows={rows} period={period} measured={measured} tone="volume" marks={marks} />;
}
