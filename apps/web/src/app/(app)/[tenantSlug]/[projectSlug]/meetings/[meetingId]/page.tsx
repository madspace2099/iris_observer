import type { Metadata } from "next";
import { NotFoundError, NotPermittedError, DEFAULT_LANGUAGE } from "@observer/readmodels";
import type { MeetingId } from "@observer/contracts";

import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { presetFrom } from "@/lib/period";
import { BriefView } from "@/showroom/BriefView";
import { MeetingReplayView, parseMeetingFilters, type MeetingSearch } from "@/components/meetings";

export const metadata: Metadata = { title: "Meeting" };

/**
 * One meeting.
 *
 * The route is the meeting, and which surface it renders depends on where the
 * meeting is in time. A meeting that has happened shows its **replay** — the
 * presentation reconstructed step by step. One that has not yet happened shows
 * its **pre-meeting brief**.
 *
 * They are deliberately the same URL. An agent thinking about Tuesday's meeting
 * does not want to know which of two products holds it, and the dispatch below
 * is unchanged from the version that established that: a replay is attempted,
 * and the absence of a showroom session against the id is what identifies a
 * meeting that has not run rather than a meeting that does not exist.
 *
 * ## ADR-0018, and what this page may not become
 *
 * The pre-meeting brief carries the buyer's own behavioural history and
 * inferred preferences. It is prohibited on every buyer-visible surface and
 * exists only in authenticated sales-agent surfaces, of which this is one. The
 * declared role list for this route is
 * `["sales_agent", "agency_manager", "madspace_admin"]` in `lib/routes.ts` and
 * is not this file's to move. Nothing added here reaches a buyer-facing
 * template: the replay half renders showroom observations, the brief half is
 * the same internal component it always was, and neither is imported by
 * anything under a buyer-visible route.
 *
 * ## Why the period is read here at all
 *
 * A single meeting is one moment and has no period. Every link leaving this
 * screen has one, though — back to the register, out to a unit, into an
 * evidence record — and navigation that dropped it would return a reader who
 * chose "Last 28 days" to the quarter without telling them. So the page reads
 * the URL's period and hands it down, and nothing on the screen states it as
 * though the meeting were measured over it.
 */
export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string; meetingId: string }>;
  searchParams: Promise<MeetingSearch & { period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug, meetingId } = await params;
  const search = await searchParams;
  const period = presetFrom(search.period);
  /* The register the reader came from, carried here by the row's link, so both ways back return to it. */
  const filters = parseMeetingFilters(search);
  const base = `/${tenantSlug}/${projectSlug}`;
  /*
   * The role list quoted above, enforced rather than only described.
   *
   * This page named the three roles in its own docblock and never checked
   * them, so a developer who typed the address got the replay — while the
   * report of the same meeting refused them (`report/page.tsx`, the identical
   * call) and the brief half refused them in the repository (ADR-0018). The
   * key is the bracketed segment, which is how every other dynamic route in
   * this product addresses its own entry; "meetings" would match the register
   * one level up, whose list is all four roles, and fail open.
   */
  requireSurface(viewer, "[meetingId]", base);

  try {
    const replay = await repository.getMeetingReplay({
      viewer,
      tenantSlug,
      projectSlug,
      meetingId: meetingId as MeetingId,
      language: DEFAULT_LANGUAGE,
    });
    const report = await repository.getReportScope(
      { viewer, tenantSlug, projectSlug, period, language: DEFAULT_LANGUAGE },
      { meetingId },
    );

    return (
      <MeetingReplayView
        replay={replay}
        period={period}
        base={base}
        filters={filters}
        report={report}
        /*
         * Read from the project's own declared sources on the replay's context,
         * not from anything about this meeting. It changes which sentence the
         * unverified-outcome band carries: a project with no CRM has no system
         * of record to have confirmed anything, and a project with one has a
         * system of record Observer does not yet read a per-meeting stage from.
         * Those are two different absences and a reader deciding whether to go
         * and look needs to know which one they are holding.
         */
        crmConnected={replay.context.project.connectedSources.includes("crm")}
      />
    );
  } catch (error) {
    if (!(error instanceof NotFoundError) && !(error instanceof NotPermittedError)) throw error;
    // No showroom session against this id, so it is a meeting that has not run.
    return (
      <BriefView
        tenantSlug={tenantSlug}
        projectSlug={projectSlug}
        meetingId={meetingId}
        period={period}
      />
    );
  }
}
