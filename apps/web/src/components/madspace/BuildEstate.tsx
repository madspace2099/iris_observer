"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
 */
export function BuildEstate() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function press() {
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
    <div className="mad-driver mad-driver--inline">
      <div className="mad-driver-head">
        <h2 className="mad-driver-title">Build the demonstration estate</h2>
        <p className="mad-driver-note">
          Development only. Creates one project and one source through the real admin services — the
          same estate the lifecycle driver operates. The source arrives unactivated, because that is
          where a newly registered installation actually starts.
        </p>
      </div>

      <div className="mad-driver-steps">
        <button
          type="button"
          className="mad-driver-step"
          onClick={press}
          disabled={busy || pending}
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
        {problem ?? "Nothing has been created from here yet."}
      </p>
    </div>
  );
}
