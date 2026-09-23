import type { Metadata } from "next";

import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { requireSurface } from "@/lib/authz";
import { maySeeSurface } from "@/lib/routes";
import { presetFrom } from "@/lib/period";
import { FilterBar, FindingList, PageHead, Synthetic } from "@/components/product";
import {
  MeetingRegister,
  meetingFilterFields,
  parseMeetingFilters,
  type MeetingSearch,
} from "@/components/meetings";

export const metadata: Metadata = { title: "Meetings" };

/**
 * PROJECT · MEETINGS — every showroom presentation in the period.
 *
 * A register, and the point of a register is to get to one record. Everything
 * on this screen either narrows the list or distinguishes one row from another:
 * who presented, which surface it ran on, how long it took, which units came
 * up, how many were shortlisted, and what was recorded at the end.
 *
 * ## One read model, one call
 *
 * `getMeetings` returns the rows, the filter options, the findings, the two
 * denominators and the sentence to show when nothing matches. It replaced a
 * bare `listMeetings` array precisely so that this page would stop making the
 * four decisions a component is not allowed to make (ADR-0012): what the period
 * is called, which agents are worth offering as a filter, what an empty result
 * means, and whether the register is worth saying anything about. All four now
 * arrive resolved, and nothing on this page is counted, filtered or formatted.
 *
 * ## The filters are a GET form, and that is what makes the screen shareable
 *
 * "Every WEB IRIS meeting Martin gave that ended without a follow-up" is a URL.
 * Submitting the bar replaces the query string with its own fields, which is
 * why the period rides along as a hidden input — `FilterBar` emits one
 * unconditionally, and without it every filter would silently return a reader
 * who chose "Last 28 days" to the quarter.
 *
 * There is no date control among the three. The period is the shell's, stated
 * once in the context band for every surface in the product, and a register
 * carrying its own date range beside a page that already has one is how two
 * panels come to measure different spans.
 *
 * ## Where the seam falls
 *
 * The head, the filters and the findings are on graphite: what we say about the
 * period, and what a reader may do about it. The register itself is the one
 * paper plate — nine columns of readings and nothing concluded — which is the
 * division ADR-0034 defines and the reason the two grounds exist at all.
 */
export default async function MeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<MeetingSearch & { period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const base = `/${tenantSlug}/${projectSlug}`;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "meetings", base);

  const search = await searchParams;
  const period = presetFrom(search.period);
  const filters = parseMeetingFilters(search);

  const view = await repository.getMeetings({ viewer, tenantSlug, projectSlug, period }, filters);

  const { context } = view;
  const periodLabel = context.period.label.toLowerCase();
  const narrowed = view.total !== view.periodTotal;

  return (
    <div className="ox-page">
      <PageHead
        kicker="Project · Meetings"
        title="Meetings"
        /*
         * A statement of scope rather than a verdict, and deliberately so.
         *
         * `MeetingListView` carries findings and no verdict, which is right: a
         * register does not have an opinion about itself. What the reader needs
         * in the first ten seconds is how much they are looking at and out of
         * how much — a figure and its denominator, which is the one thing the
         * page rules never allow to be separated.
         */
        answer={
          narrowed
            ? `${view.total} of ${view.periodTotal} presentations recorded on ${context.project.name} in ${periodLabel} match the filters below.`
            : view.periodTotal === 0
              ? /* The read model's own sentence: nothing has arrived, or nothing in this period. */
                view.emptyState
              : view.periodTotal === 1
                ? /* A project's first real meeting is the day this sentence is read most closely. */
                  `One presentation was recorded on ${context.project.name} in ${periodLabel}.`
                : `${view.periodTotal} presentations were recorded on ${context.project.name} in ${periodLabel}.`
        }
        lede="One row is one presentation. A visitor is named by their history with this project and never by a contact detail. The outcome column is what the agent selected in the room at the end of the meeting — it labels the presentation, and it is not a verified sale."
        crumbs={[{ label: "Project", href: `${base}/project` }, { label: "Meetings" }]}
        aside={<Synthetic />}
        period={period}
      />

      <div className="ox-body">
        {/*
         * With no meeting in the period there is nothing to narrow, and the bar
         * was three controls that did nothing beside "0 of 0 meetings". A filtered
         * view that matches nothing keeps it: there the bar is how the reader gets
         * the meetings back.
         */}
        {view.periodTotal === 0 ? null : (
          <section className="ox-plane">
            <div className="ox-section-head">
              <h2 className="ox-section-title">Narrow the register</h2>
              <p className="ox-section-note">
                Each option carries how many meetings it would keep, counted over the whole period
                rather than over what is already on screen. The dates come from the period in the
                bar above.
              </p>
            </div>

            <FilterBar
              action={`${base}/meetings`}
              fields={meetingFilterFields(view.options, view.filters)}
              period={period}
              resultCount={`${view.total} of ${view.periodTotal} meetings`}
              label="Narrow the meeting register"
            />
          </section>
        )}

        {/*
         * THE PAPER PLATE. Nine columns of readings, one row per presentation.
         *
         * The densest measured body in the product, and the case ADR-0034 wrote
         * the light ground for. Nothing inside it is concluded; everything
         * concluded about it is on the graphite above and below.
         */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <MeetingRegister
              rows={view.rows}
              period={period}
              filters={view.filters}
              canOpen={maySeeSurface(viewer.role, "[meetingId]")}
              caption={`Showroom presentations on ${context.project.name}, newest first. ${view.total} of ${view.periodTotal} in ${periodLabel}.`}
              emptyState={view.emptyState}
            />
          </div>
        </div>

        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">What the register shows</h2>
            <p className="ox-section-note">
              Each statement carries what it rests on, how many meetings stand behind it, and where
              to look next.
            </p>
          </div>

          <FindingList
            findings={view.findings}
            period={period}
            sampleNoun="meetings"
            emptyNote="Nothing about this period's register was worth stating on its own. That is the read model's answer, not a gap in it."
          />
        </section>
      </div>
    </div>
  );
}
