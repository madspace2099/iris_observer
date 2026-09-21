import type { Metadata } from "next";
import Link from "next/link";

import { ChecksRegister, StateList } from "@/components/attention";
import { AttentionList, Evidence, PageHead, Sample, Synthetic } from "@/components/product";
import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";

export const metadata: Metadata = { title: "Attention" };

/**
 * ATTENTION — what is not going to resolve itself.
 *
 * "Which apartments need attention right now?" is one of the openings Ask IRIS
 * offers, and an answer worth acting on is worth an address: this is where that
 * answer lives, so it can be linked, sent and returned to rather than re-asked.
 *
 * It is not a navigation item. It is reached BY NAME from Ask IRIS, which is
 * the relationship the two actually have — a question and the list it produces
 * — and `surfaces.test.ts` records it in `reachedFromAView` so the link cannot
 * quietly disappear and leave the route stranded. The breadcrumb says the same
 * thing to the reader.
 *
 * ## Two regions, and the seam between them is the argument
 *
 * ADR-0034 divides the product by CONTENT rather than by page: above the seam
 * what we conclude and what a reader may do about it, below it what was
 * measured. This screen is the clearest case in the product.
 *
 *   graphite   the states that were raised, ranked, each naming what it is
 *              about and carrying the control that deals with it.
 *   paper      the register of every check that ran, including the four that
 *              came back clean or could not be asked at all.
 *
 * The register is not a footnote. A panel that shows only raised states renders
 * "nothing is wrong" and "nothing was measured" identically, as empty space, and
 * the second is the more urgent of the two. `AttentionView` returns both because
 * of that, and this screen draws both because of that.
 *
 * ## What this screen refuses to do
 *
 * **It does not choose a severity.** Every kind declares the loudest it may ever
 * reach, the read model clamps to that ceiling, and red is reserved for a fact
 * going missing from the record right now — a showroom that stopped reporting,
 * a connected CRM recording nothing. Falling demand is amber however bad it
 * looks, since a commercial situation is not an incident and a product that
 * paints one red has no colour left for the day the installation goes quiet.
 *
 * **It does not rank a state it cannot support.** `belowMinimum` suppresses the
 * rank and prints the shortfall in its place. A ranked list of units is the most
 * persuasive thing this product can draw and the easiest one to draw from four
 * meetings.
 *
 * **It counts nothing.** The two figures in the answer sentence are the length
 * of the two lists this page is rendering and `AttentionView.meetingCount`. No
 * metric is derived here and no two read models are joined (ADR-0012); the one
 * call this page makes returns everything on it.
 */
export default async function AttentionPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  // Declared in SURFACES, enforced here — a hidden link is not access control.
  requireSurface(viewer, "attention", root);
  const period = presetFrom((await searchParams).period);

  const view = await repository.getAttention({ viewer, tenantSlug, projectSlug, period });

  const raised = view.states.length;
  const asked = view.checks.length;

  return (
    <div className="ox-page">
      <PageHead
        period={period}
        crumbs={[{ label: "Ask IRIS", href: `${root}/ask` }, { label: "What needs attention" }]}
        kicker={`${view.context.project.name} · ${view.context.period.label}`}
        title="What needs attention"
        /*
         * The ten-second answer. When nothing is raised it is the read model's
         * own sentence, which already says how many checks could not be
         * evaluated — an all-clear that does not admit what it could not look at
         * is the one kind of all-clear worth distrusting.
         */
        answer={
          raised === 0
            ? view.emptyState
            : `${raised} of ${asked} checks raised something on ${view.context.project.name}, across ${view.meetingCount} presentations in this period.`
        }
        lede="Each state names what it is about and where it can be dealt with. Red is kept for a record going missing right now; a number moving the wrong way is a reading, and it is drawn as one."
        aside={
          <>
            <Synthetic />
            {/*
             * The way onward when nothing is raised. A screen whose only
             * controls belong to its rows is a dead end on the day it has no
             * rows, and "nothing needs attention" is a result this product
             * expects to give often.
             */}
            <Link
              className="ox-btn"
              data-weight="quiet"
              href={dynamicRoute(withPeriod(`${root}/showroom`, period))}
            >
              Today&rsquo;s briefing
            </Link>
          </>
        }
      />

      <div className="ox-body">
        {/* --- what was raised. A conclusion, so it stays on graphite. ---- */}
        <section className="ox-plane">
          <div className="ox-section-head">
            <h2 className="ox-section-title">Raised in this period</h2>
            <p className="ox-section-note">
              Severity first, then how much each one is about. A state below its minimum sample is
              stated without a rank.
            </p>
          </div>

          {raised === 0 ? (
            /*
             * The product layer's own empty result, not a second one written
             * here. "Nothing needs attention" is among the most useful things
             * this product can say, and it must read identically wherever it
             * appears — a dashed slot would say "this panel failed to fill",
             * which is a different statement and an alarming one.
             */
            <AttentionList
              alerts={[]}
              period={period}
              emptyNote={view.emptyState}
              label="Raised in this period"
            />
          ) : (
            <StateList states={view.states} period={period} />
          )}
        </section>

        {/* --- what was asked. Measured, so it goes on paper. ------------- */}
        <div className="ox-plate ox-paper">
          <div className="ox-plate-inner">
            <div className="ox-section-head">
              <h2 className="ox-section-title">Every check, and what it found</h2>
              <span className="ox-chart-period">{view.context.period.label}</span>
            </div>

            <ChecksRegister checks={view.checks} period={period} />

            <div className="ox-finding-foot">
              <Evidence evidence={view.evidence} period={period} />
              <Sample n={view.meetingCount} noun="presentations" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
