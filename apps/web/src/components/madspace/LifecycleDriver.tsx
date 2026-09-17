"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip } from "@/components/madspace/StatusMark";
import {
  activateAction,
  diagnosticAction,
  heartbeatAction,
  issueCodeAction,
  meetingAction,
  resumeAction,
  seedReviewEstateAction,
  simulateBusyInstallationAction,
  suspendAction,
} from "@/lib/sources/demo-actions";

/**
 * The lifecycle driver — DEVELOPMENT ONLY.
 *
 * Every state this surface can show needs a real installation to produce it,
 * and there is no Unreal machine on this desk. So this walks the same five
 * states a real one would, through the same services and the same HTTP
 * endpoints a real one would use.
 *
 * ## What makes it honest
 *
 * It sets NOTHING. There is no client state here that a screen reads, no
 * "pretend connected" flag, no fixture the UI is taught to believe. Each button
 * performs a real operation — issue a code, exchange it at
 * `/functions/v1/observer-activate`, post a real heartbeat, post a real
 * `diagnostic.test` batch — and then the page is revalidated and re-reads
 * whatever Postgres now says.
 *
 * If the backend stops working, these buttons stop working. That is the point:
 * a driver that could not fail would be proving nothing.
 *
 * ## Why it is mounted rather than a script
 *
 * A seed script would produce one state and leave it there. Reviewing a status
 * screen means moving BETWEEN states and watching each transition land, which
 * is a thing you do with your hands.
 *
 * ## How it stays out of production
 *
 * The server component that mounts it renders nothing unless
 * `localControlPlaneEnabled()` is true, which requires a non-production
 * `NODE_ENV` and an explicit environment variable. The check is on the server;
 * this component is never sent to a browser that should not have it.
 */

type Step = {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly run: () => Promise<
    { readonly ok: true } | { readonly ok: false; readonly problem: string }
  >;
};

/** Normalises the varied success shapes into the one thing this cares about. */
async function attempt(
  work: () => Promise<{ readonly ok: boolean; readonly problem?: string }>,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: string }> {
  const answer = await work();
  if (answer.ok) return { ok: true };
  return { ok: false, problem: answer.problem ?? "The operation was refused." };
}

const STEPS: readonly Step[] = [
  {
    key: "activate",
    label: "Activate",
    detail: "Issues a one-time code and exchanges it at the activation endpoint.",
    run: () =>
      attempt(async () => {
        const issued = await issueCodeAction();
        if (!issued.ok) return issued;
        return activateAction(issued.code);
      }),
  },
  {
    key: "heartbeat",
    label: "Send heartbeat",
    detail: "Posts a real bounded heartbeat.",
    run: () => attempt(() => heartbeatAction()),
  },
  {
    key: "diagnostic",
    label: "Send diagnostic.test",
    detail: "Posts a real event batch through ingestion.",
    run: () => attempt(() => diagnosticAction()),
  },
  {
    key: "meeting",
    label: "Send a showroom meeting",
    detail:
      "Posts one whole session as the plugin sends it, so Sales Flow and Meetings have a real meeting to show.",
    run: () => attempt(() => meetingAction()),
  },
  {
    key: "seed",
    label: "Add the review estate",
    detail:
      "Registers three more projects and six more sources through the real admin services, so a list has something to be judged on.",
    run: () => attempt(() => seedReviewEstateAction()),
  },
  {
    key: "busy",
    label: "Report a busy outbox",
    detail:
      "Posts a heartbeat as a loaded installation would, so the operational figures have something in them.",
    run: () => attempt(() => simulateBusyInstallationAction()),
  },
  {
    key: "suspend",
    label: "Suspend",
    detail: "Stops the backend accepting this source. Reversible, and nothing is deleted.",
    run: () => attempt(() => suspendAction()),
  },
  {
    key: "resume",
    label: "Resume",
    detail: "Switches it back on.",
    run: () => attempt(() => resumeAction()),
  },
];

export function LifecycleDriver() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{
    readonly ok: boolean;
    /** The chip's word: what happened, or which step it was. */
    readonly word: string;
    readonly text: string;
  } | null>(null);

  function press(step: Step) {
    /*
     * The guard is here rather than on the elements. `aria-disabled` says the
     * step is unavailable without taking focus off the button that was just
     * pressed, which is the same argument the sheet makes beside `.mad-action`
     * and the one `ActivationCodeDialog` already follows.
     */
    if (busy !== null || pending) return;
    setBusy(step.key);
    setSaid(null);
    void step.run().then((answer) => {
      setBusy(null);
      setSaid(
        answer.ok
          ? { ok: true, word: step.label, text: "completed." }
          : { ok: false, word: "Refused", text: answer.problem },
      );
      /*
       * `router.refresh()`, not `window.location.reload()`.
       *
       * The server action has already revalidated its path; this re-runs the
       * server components and swaps the result in without a navigation. The
       * first version reloaded the document, which lost the scroll position
       * mid-review, threw away the message that had just been set, and raced
       * anything reading the page — the browser E2E failed on exactly that,
       * with the execution context destroyed under it.
       */
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <section className="mad-driver" aria-labelledby="driver-heading">
      <div className="mad-driver-head">
        {/*
         * The control is a SIBLING of the heading, never inside it.
         *
         * A button nested in the `h2` joins that heading's accessible name, so
         * a reader moving by heading heard "Lifecycle driver About what each
         * step proves" and the heading stopped naming the section. Wrapping the
         * words in a span moved the id off the heading but left the heading's
         * own name alone, so it fixed nothing a reader could hear. With the
         * control outside, the id sits on the `h2` itself and one element
         * carries both names.
         */}
        <div className="mad-idline">
          <h2 id="driver-heading">Lifecycle driver</h2>
          <InfoNote label="what each step proves">
            <p>Activation runs as the plugin would: it is what proves ACTIVATED.</p>
            <p>A heartbeat proves CONNECTED and nothing else.</p>
            <p>A diagnostic.test batch is the only thing that proves INGESTION VERIFIED.</p>
            <p>
              A showroom meeting proves the other half: that stored events come back as a meeting on
              the customer&rsquo;s screens. The project it lands in stops showing synthetic
              sessions.
            </p>
            <p>
              Nothing here sets a display value, so the states below are read back from the database
              exactly as an installation would have left them.
            </p>
          </InfoNote>
        </div>

        <p className="mad-driver-note">
          Development only. Every button performs the real operation through the real endpoints.
        </p>
      </div>

      {/*
       * No `title` attribute. A native tooltip is hover-only, unreachable by
       * touch and unreliable for a screen reader, and it was carrying the same
       * string the button already renders. What was worth keeping out of the
       * label moved to the disclosure beside the heading instead.
       */}
      <div className="mad-driver-steps">
        {STEPS.map((step) => (
          <button
            key={step.key}
            type="button"
            className="mad-driver-step"
            onClick={() => press(step)}
            aria-disabled={busy !== null || pending}
          >
            <span className="mad-driver-step-label">
              {busy === step.key ? `${step.label}…` : step.label}
            </span>
            <span className="mad-driver-step-detail">{step.detail}</span>
          </button>
        ))}
      </div>

      <p
        className="mad-driver-said"
        data-tone={said === null ? "quiet" : said.ok ? "good" : "weak"}
        role="status"
        aria-live="polite"
      >
        {said === null ? (
          "No operation has been run from here yet."
        ) : (
          <>
            <StatusChip tone={said.ok ? "good" : "wrong"}>{said.word}</StatusChip> {said.text}
          </>
        )}
      </p>
    </section>
  );
}
