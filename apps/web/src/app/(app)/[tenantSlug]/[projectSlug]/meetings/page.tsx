import type { Metadata } from "next";
import Link from "next/link";
import type { PeriodPreset } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { dynamicRoute } from "@/lib/href";

export const metadata: Metadata = { title: "Meetings" };

/**
 * Every showroom meeting in the period.
 *
 * A list, not a dashboard: the point of this page is to get to one meeting. It
 * carries only what distinguishes one row from another — who presented, how
 * long, how far into IRIS they went, and what was recorded at the end.
 */
export default async function MeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "meetings", `/${tenantSlug}/${projectSlug}`);
  const search = await searchParams;

  const meetings = await repository.listMeetings({
    viewer,
    tenantSlug,
    projectSlug,
    period: presetFrom(search.period) as PeriodPreset,
  });

  return (
    <div className="iris-one">
      <section className="iris-plane iris-stack">
        <p className="iris-kicker">Meetings</p>
        <h1 className="iris-section">{meetings.length} showroom presentations.</h1>
        <p className="iris-meta" style={{ maxWidth: "62ch" }}>
          Open one to see it reconstructed step by step — the sections in the order they were shown,
          the units opened inside them, and what the source could not record.
        </p>

        <div className="iris-matrix" data-columns="meetings" style={{ marginTop: ".75rem" }}>
          <div className="iris-matrix-head">
            <span>when</span>
            <span>agent</span>
            <span style={{ textAlign: "right" }}>length</span>
            <span style={{ textAlign: "right" }}>sect</span>
            <span style={{ textAlign: "right" }}>units</span>
            <span style={{ textAlign: "right" }}>outcome</span>
          </div>
          {meetings.map((m) => (
            <Link className="iris-matrix-row" key={m.meetingId} href={dynamicRoute(m.href)}>
              <span className="iris-matrix-code">{m.label}</span>
              <span className="iris-bar-label" title={m.agentName}>
                {m.agentName}
              </span>
              <span className="iris-matrix-num">{m.durationDisplay}</span>
              <span className="iris-matrix-num">{m.sectionCount}</span>
              <span className="iris-matrix-num">{m.unitCount}</span>
              {/*
               * The outcome is a phrase, not a figure.
               *
               * It sat in a 4.5rem numeric column and "Presentation only" was
               * cut to "Presentation onl" at every width, including 1920 —
               * two empty placeholder cells were holding the space it needed.
               */}
              <span className="iris-matrix-outcome">{m.outcomeLabel}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
