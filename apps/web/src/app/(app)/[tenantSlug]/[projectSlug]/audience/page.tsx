import type { Metadata } from "next";
import Link from "next/link";
import { PLACE_CATEGORIES, PLACE_CATEGORY_LABELS, type PlaceCategory } from "@observer/contracts";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";
import { Gaps, SourceChips } from "@/showroom/parts";

export const metadata: Metadata = { title: "Audience" };

/**
 * Who to contact, chosen by what they did.
 *
 * The case this exists for: a nursery is going up in the next street, and an
 * agent wants everyone who shortlisted a two-room flat and spent their time on
 * family places. That is two behaviours and a filter, and without it the agent
 * is reading meeting notes one by one.
 *
 * **It returns meetings, not a mailing list.** Identity stays on the surface
 * that already governs it (ADR-0018): the agent opens a meeting to reach the
 * contact, which keeps one route to a person and one place where that route is
 * checked. A page that printed names and addresses would be a second one.
 *
 * And it is careful about what it claims. Time on a category of place is a
 * behaviour. "Probably has children" is a reading a human may make from it;
 * Observer states the behaviour and lets them make it.
 */
const ROOM_OPTIONS = [
  { value: "", label: "Any unit" },
  { value: "2", label: "Two-room" },
  { value: "3", label: "Three-room" },
] as const;

export default async function AudiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{
    period?: string;
    rooms?: string;
    category?: string;
    seconds?: string;
    all?: string;
  }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "audience", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const rooms = search.rooms === "2" || search.rooms === "3" ? Number(search.rooms) : null;
  const category = (PLACE_CATEGORIES as readonly string[]).includes(search.category ?? "")
    ? (search.category as PlaceCategory)
    : null;
  const seconds = Number(search.seconds) > 0 ? Number(search.seconds) : 25;
  const favouritedOnly = search.all !== "1";

  const view = await repository.getAudience(
    { viewer, tenantSlug, projectSlug, period: presetFrom(search.period) as PeriodPreset },
    { rooms, favouritedOnly, placeCategory: category, minimumPlaceSeconds: seconds },
  );

  const root = `/${tenantSlug}/${projectSlug}/audience`;
  const qs = (next: Record<string, string | null>) => {
    const p = new URLSearchParams({ period: presetFrom(search.period) });
    const current: Record<string, string | null> = {
      rooms: rooms === null ? null : String(rooms),
      category,
      seconds: String(seconds),
      all: favouritedOnly ? null : "1",
      ...next,
    };
    for (const [k, v] of Object.entries(current)) if (v !== null && v !== "") p.set(k, v);
    return `${root}?${p.toString()}`;
  };

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Audience · {view.context.period.label}</p>
        <h1 className="iris-section">
          {view.total} of {view.ofMeetings} meetings match.
        </h1>
        <p className="iris-body" style={{ maxWidth: "62ch", color: "var(--ink-2)" }}>
          {view.description}
        </p>

        <div className="iris-criteria">
          <div>
            <p className="iris-kicker">Unit</p>
            <div className="iris-segmented" role="tablist" aria-label="Unit type">
              {ROOM_OPTIONS.map((o) => (
                <Link
                  key={o.value || "any"}
                  role="tab"
                  aria-selected={(rooms === null ? "" : String(rooms)) === o.value}
                  href={dynamicRoute(qs({ rooms: o.value === "" ? null : o.value }))}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="iris-kicker">Strength of interest</p>
            <div className="iris-segmented" role="tablist" aria-label="Strength of interest">
              <Link
                role="tab"
                aria-selected={favouritedOnly}
                href={dynamicRoute(qs({ all: null }))}
              >
                Shortlisted it
              </Link>
              <Link
                role="tab"
                aria-selected={!favouritedOnly}
                href={dynamicRoute(qs({ all: "1" }))}
              >
                Merely opened it
              </Link>
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <p className="iris-kicker">Spent at least {seconds}s on places of this kind</p>
            <div className="iris-mode-strip">
              <Link
                className="iris-chip"
                aria-current={category === null ? "true" : undefined}
                href={dynamicRoute(qs({ category: null }))}
              >
                Any
              </Link>
              {PLACE_CATEGORIES.map((c) => (
                <Link
                  key={c}
                  className="iris-chip"
                  aria-current={category === c ? "true" : undefined}
                  href={dynamicRoute(qs({ category: c }))}
                >
                  {PLACE_CATEGORY_LABELS[c]}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <SourceChips sources={["IRIS_SHOWROOM_OBSERVED"]} />

        <hr className="iris-rule" />

        {view.total === 0 ? (
          <p className="iris-body" style={{ color: "var(--ink-2)" }}>
            Nothing matched. That is an answer about this period, not an error — try a weaker
            strength of interest, a lower threshold, or a different kind of place.
          </p>
        ) : (
          <div className="iris-matrix" data-columns="audience">
            <div className="iris-matrix-head">
              <span>Meeting</span>
              <span>Agent</span>
              <span>Why it matched</span>
              <span style={{ textAlign: "right" }}>Outcome</span>
            </div>
            {view.matches.map((m) => (
              <Link className="iris-matrix-row" key={m.meetingId} href={dynamicRoute(m.href)}>
                <span className="iris-matrix-code">{m.startedDisplay}</span>
                <span className="iris-bar-label" title={m.agentName}>{m.agentName}</span>
                <span className="iris-bar-label" title={m.because}>
                  {m.because}
                </span>
                <span className="iris-matrix-num" style={{ textAlign: "right" }}>
                  {m.outcomeLabel}
                </span>
              </Link>
            ))}
          </div>
        )}

        <Gaps gaps={view.caveats} title="What this is, and is not" />
      </section>
    </div>
  );
}
