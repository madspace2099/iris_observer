import type { Metadata } from "next";
import Link from "next/link";

import { requireSurface } from "@/lib/authz";
import { dynamicRoute } from "@/lib/href";
import { presetFrom, withPeriod } from "@/lib/period";
import { repository } from "@/lib/repository";
import { requireViewer } from "@/lib/session";
import { Empty, FilterBar, PageHead, Synthetic, Unavailable } from "@/components/product";
import { ThreadList } from "@/components/ask/ThreadList";

import { DEFAULT_LANGUAGE } from "@observer/readmodels";
export const metadata: Metadata = { title: "Earlier questions" };

/**
 * THE READER'S EARLIER QUESTIONS ON THIS PROJECT.
 *
 * Ask IRIS is a primary interface rather than a chatbot, and the difference
 * shows here: a question that was worth asking is worth returning to, so each
 * one keeps a URL instead of scrolling out of a transcript. This screen is the
 * index of those URLs.
 *
 * ## NOBODY HELD THESE CONVERSATIONS, AND THAT IS SAID ON THE PAGE
 *
 * `getAskHistory` returns threads stamped `demonstration` — a single-member
 * union, chosen so that no component can compare its way into presenting one as
 * somebody's own past question — together with a `demonstrationNotice` written
 * by the read model. The notice is rendered at the top of the register rather
 * than in a footnote, because a list of plausible questions somebody could
 * mistake for their own history is exactly the failure this product exists to
 * argue against.
 *
 * What is NOT invented is the content. Every figure inside every one of these
 * threads is computed from this project's session slice at read time, so a
 * thread about ISTER TOWER states ISTER TOWER's numbers and one about Riverside
 * states that Riverside has no recorded outcomes at all.
 *
 * ## PIN, RENAME AND DELETE ARE NOT DRAWN, AND THE REFUSAL IS STATED ONCE
 *
 * Nothing on this deployment writes to a conversation store: the port offers
 * `getAskHistory` and `getAskThread` and no mutation at all. The doctrine's
 * answer to a control with nothing behind it is that it is either honestly
 * labelled or disabled with a stated reason, and never one that looks ready.
 *
 * Drawing three disabled controls on every row would satisfy the letter of that
 * and break its purpose: `docs/12-visual-autopsy.md` §9 records four panels in
 * one viewport each repeating the same absence, and five rows of pin, rename
 * and delete is fifteen versions of the same defect. So the absence is stated
 * ONCE for the region, in the shape the sheet reserves for exactly that, and no
 * dead control is drawn.
 *
 * `pinned` itself is still shown, because it is a real field the read model
 * sets and two of these threads carry it. A state that exists is drawn; only
 * the writing of it is missing.
 *
 * ## SEARCH IS A VIEW FILTER, AND THIS FILE ADMITS THAT
 *
 * `getAskHistory` takes no filter argument — unlike `getMeetings`, which takes
 * an explicit `MeetingFilters` — so search cannot be pushed into the read
 * model. It is applied here, over the list the repository already returned, and
 * it matches on the title and the stored context only. That is a text filter
 * over rows and not a metric: no figure on this screen is derived from it
 * except the count of rows it leaves, which is printed with its denominator.
 *
 * The consequence is honest and worth knowing: the list cannot page, and a
 * search cannot reach a conversation the period did not return. The port gap is
 * reported rather than worked around with a second read.
 */
export default async function AskHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; projectSlug: string }>;
  searchParams: Promise<{ period?: string; q?: string }>;
}) {
  const viewer = await requireViewer();
  const { tenantSlug, projectSlug } = await params;
  const root = `/${tenantSlug}/${projectSlug}`;
  /*
   * The surface key is the LAST path segment, which is how `requireSurface`
   * finds its entry. `history` collides with nothing else declared.
   */
  requireSurface(viewer, "history", root);

  const search = await searchParams;
  const period = presetFrom(search.period);
  const term = (search.q ?? "").trim();

  const { project } = await repository.resolveProject(viewer, tenantSlug, projectSlug);
  const history = await repository.getAskHistory({
    viewer,
    tenantSlug,
    projectSlug,
    period,
    language: DEFAULT_LANGUAGE,
  });

  const needle = term.toLowerCase();
  const matches = (thread: (typeof history.threads)[number]): boolean =>
    needle.length === 0 ||
    thread.title.toLowerCase().includes(needle) ||
    (thread.selectionLabel ?? "").toLowerCase().includes(needle);

  const threads = history.threads.filter(matches);
  const pinned = history.pinned.filter(matches);

  const askPath = `${root}/ask`;
  const historyPath = `${root}/ask/history`;

  return (
    <div className="ox-page">
      <PageHead
        kicker={`${project.name} · Ask IRIS`}
        title="Earlier questions"
        crumbs={[{ label: "Ask IRIS", href: askPath }, { label: "Earlier questions" }]}
        answer={
          history.threads.length === 0 ? (
            <>
              There is nothing to return to on {project.name} for{" "}
              {history.context.period.label.toLowerCase()}.
            </>
          ) : (
            <>
              {history.threads.length} conversations are kept for {project.name} over{" "}
              {history.context.period.label.toLowerCase()}, each at its own address so an answer can
              be sent to a colleague rather than asked again.
            </>
          )
        }
        lede={history.demonstrationNotice}
        aside={
          <>
            <Synthetic />
            <Link
              className="ox-btn"
              data-weight="primary"
              href={dynamicRoute(withPeriod(askPath, period))}
            >
              Ask a new question
            </Link>
          </>
        }
        period={period}
      />

      <div className="ox-body">
        <div className="ox-plane">
          <FilterBar
            action={historyPath}
            period={period}
            label="Search earlier questions"
            submitLabel="Search"
            fields={[
              {
                kind: "search",
                name: "q",
                label: "Find a question",
                value: term,
                placeholder: "A word from the question, or a unit code",
              },
            ]}
            resultCount={
              <>
                {threads.length} of {history.threads.length}{" "}
                {history.threads.length === 1 ? "conversation" : "conversations"}
              </>
            }
          />

          {/*
           * Stated once for the whole register, with no action, because there
           * is genuinely nowhere to send a reader: the writing is not built,
           * not merely out of this account's reach.
           */}
          <Unavailable
            what="Pinning, renaming and deleting a conversation"
            why="nothing on this deployment writes to the conversation store, so those controls would look ready and do nothing"
            period={period}
          />
        </div>

        {history.threads.length === 0 ? (
          <div className="ox-plane">
            <Empty title="No earlier questions" note={history.emptyState} />
          </div>
        ) : (
          <>
            {pinned.length === 0 ? null : (
              <div className="ox-plane">
                <div className="ox-section-head">
                  <h2 className="ox-section-title">Pinned</h2>
                  <span className="ox-n">
                    {pinned.length} pinned of {history.threads.length}
                  </span>
                </div>
                <p className="ox-section-note">
                  Kept at the top because somebody marked them. They appear again below, in date
                  order, so the register stays a complete list rather than two partial ones.
                </p>
                {/*
                 * A register of records goes on the paper ground (ADR-0034):
                 * titles, stamps, the project and period each answer was
                 * measured against. The conclusion about the register stays on
                 * graphite above it.
                 */}
                <div className="ox-plate ox-paper">
                  <div className="ox-plate-inner">
                    <ThreadList threads={pinned} period={period} label="Pinned conversations" />
                  </div>
                </div>
              </div>
            )}

            <div className="ox-plane">
              <div className="ox-section-head">
                <h2 className="ox-section-title">Every question, newest first</h2>
                <span className="ox-n">
                  {threads.length} of {history.threads.length}
                </span>
              </div>

              {threads.length === 0 ? (
                <Empty
                  title="No conversation matches that search"
                  note={`Nothing among the ${history.threads.length} conversations kept for ${history.context.period.label.toLowerCase()} contains “${term}”. The search reads the question and the selection it was asked against, and nothing inside the answers.`}
                />
              ) : (
                <div className="ox-plate ox-paper">
                  <div className="ox-plate-inner">
                    <ThreadList
                      threads={threads}
                      period={period}
                      label="Earlier questions on this project"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
