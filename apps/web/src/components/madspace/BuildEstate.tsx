"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { InfoNote } from "@/components/madspace/InfoNote";
import { StatusChip } from "@/components/madspace/StatusMark";
import { buildEstateAction } from "@/lib/sources/demo-actions";

/**
 * The way back from an empty estate — DEVELOPMENT ONLY.
 *
 * A fresh clone and a reset both land here: no project, no source, and no
 * screen that can make one, because the lifecycle driver lives on Source Detail
 * and Source Detail is reached through a list that is empty. This is the one
 * control that breaks that circle.
 *
 * It creates the same demonstration estate every lifecycle button already
 * ensures, through the same function, so there is no second definition of what
 * the estate is. Nothing here is a fixture: the project and the source are real
 * rows created through the real admin services, and the source that appears is
 * not activated, not connected and not verified — which is exactly the state a
 * newly registered installation is in.
 *
 * The server component that mounts it renders nothing unless
 * `localControlPlaneEnabled()` is true.
 *
 * ## Why the scope is a band and not a sentence
 *
 * The press reaches past the screen it is on: it writes a project and a source
 * into the estate every other screen reads. The system gives that its own
 * surface — ink, named in full words, listing what it touches — because a
 * sentence in the same grey as the rest of the panel is what an operator skips.
 */
export function BuildEstate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function press() {
    /*
     * The guard is here rather than on the element, for the reason argued in
     * the sheet beside `.mad-action`: a disabled button cannot hold focus, so
     * disabling the one just pressed throws the operator to `<body>` mid-press.
     * `aria-disabled` says the same thing to assistive technology and this
     * returns early, which is what actually prevents a second estate.
     */
    if (busy || pending) return;
    setBusy(true);
    setProblem(null);
    void buildEstateAction().then((answer) => {
      setBusy(false);
      if (!answer.ok) {
        setProblem(answer.problem);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <section className="mad-driver mad-driver--inline" aria-labelledby="build-estate-heading">
      <div className="mad-driver-head">
        {/*
         * The control is a SIBLING of the heading, never inside it.
         *
         * A button nested in the `h2` joins that heading's accessible name, so
         * the section announced as "Build the demonstration estate About the
         * estate this creates". Moving the id onto an inner span fixed the
         * SECTION's name and left the HEADING's alone, which is the half a
         * reader actually hears. With the control outside, the id goes back on
         * the `h2` and one element carries both names.
         */}
        <div className="mad-idline">
          <h2 id="build-estate-heading">Build the demonstration estate</h2>
          <InfoNote label="the estate this creates">
            <p>
              It is the same estate the lifecycle driver operates. The source arrives unactivated,
              because that is where a newly registered installation actually starts.
            </p>
          </InfoNote>
        </div>

        {/*
         * Inside the head rather than after it, because the head is the one
         * element here with rhythm of its own: 8px from the heading above and
         * 16px to the controls below, without a margin declared at the call
         * site that would drift from the panel it belongs to.
         */}
        <p className="mad-driver-note">
          Development only. Creates one project and one source through the real admin services.
        </p>
      </div>

      <div className="mad-driver-steps">
        <button
          type="button"
          className="mad-driver-step"
          onClick={press}
          aria-disabled={busy || pending}
        >
          <span className="mad-driver-step-label">{busy ? "Building…" : "Build the estate"}</span>
          <span className="mad-driver-step-detail">
            One project, one source, nothing activated.
          </span>
        </button>
      </div>

      <p
        className="mad-driver-said"
        data-tone={problem === null ? "quiet" : "weak"}
        role="status"
        aria-live="polite"
      >
        {problem === null ? (
          "Nothing has been created from here yet."
        ) : (
          <>
            <StatusChip tone="wrong">Refused</StatusChip> {problem}
          </>
        )}
      </p>
    </section>
  );
}
