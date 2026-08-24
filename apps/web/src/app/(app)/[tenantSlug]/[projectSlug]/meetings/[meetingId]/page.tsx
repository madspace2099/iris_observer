import type { Metadata } from "next";
import { NotFoundError, NotPermittedError } from "@observer/readmodels";
import type { MeetingId } from "@observer/contracts";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { BriefView } from "@/showroom/BriefView";
import { Replay } from "@/showroom/Replay";

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
 * does not want to know which of two products holds it.
 */
export default async function MeetingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string; meetingId: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug, meetingId } = await params;

  try {
    const replay = await repository.getMeetingReplay({
      viewer,
      tenantSlug,
      projectSlug,
      meetingId: meetingId as MeetingId,
    });
    return <Replay replay={replay} />;
  } catch (error) {
    if (!(error instanceof NotFoundError) && !(error instanceof NotPermittedError)) throw error;
    // No showroom session against this id, so it is a meeting that has not run.
    return <BriefView tenantSlug={tenantSlug} projectSlug={projectSlug} meetingId={meetingId} />;
  }
}
