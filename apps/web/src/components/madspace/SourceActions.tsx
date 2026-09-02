"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/madspace/ConfirmDialog";
import {
  archiveSourceAction,
  resumeSourceAction,
  revokeCredentialAction,
  suspendSourceAction,
} from "@/lib/madspace/source-actions";

/**
 * THE LIFECYCLE OPERATIONS, OFFERED ONLY WHERE THEY ARE VALID.
 *
 * The list is computed from the state the source is actually in, and there are
 * no disabled buttons in it. A greyed-out Resume beside an active source is a
 * control whose whole contribution is to be refused; leaving it out says the
 * same thing with less furniture, and it matches what `ObserverAdmin` will do —
 * every operation invalid in the current state comes back `unknown_source`,
 * which is the service refusing rather than the screen being polite.
 *
 * ## Suspend is not Delete, and the styling says so
 *
 * Suspend and Resume are two halves of one reversible switch. Archive is the
 * only operation here with no inverse, so it is the only one that takes the
 * strongest treatment the surface has. Painting Suspend red as well would teach
 * an operator that the red ones are routine — which is precisely the training
 * that makes the terminal one dangerous.
 *
 * ## Every one of them is confirmed in sentences
 *
 * Not "Are you sure?". The operator is deciding about a machine in a building,
 * and what they need is what happens to the installation, to the events it is
 * holding, and to the record. Three plain statements, written out in
 * {@link OPERATIONS}.
 */

interface Operation {
  readonly id: string;
  /** On the button. A verb, in the imperative. */
  readonly label: string;
  readonly kicker: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly confirmLabel: string;
  readonly weight: "reversible" | "terminal";
  /** What the operator sees, politely, once it has landed. */
  readonly done: string;
  readonly run: (sourceId: string) => Promise<{ readonly ok: boolean; readonly problem?: string }>;
}

const SUSPEND: Operation = {
  id: "suspend",
  label: "Suspend",
  kicker: "Reversible",
  title: "Suspend this source",
  paragraphs: [
    "Observer stops accepting heartbeats and events from this source. Anything the installation sends while it is suspended is refused at the boundary rather than stored.",
    "The IRIS installation keeps its pending events locally. They stay in its own outbox and are delivered when the source is resumed, subject to whatever ceiling that outbox has.",
    "Nothing is deleted. Every event already accepted stays exactly where it is, the credential remains valid, and the source's record is unchanged.",
    "Resume returns it to active whenever you are ready.",
  ],
  confirmLabel: "Suspend",
  weight: "reversible",
  done: "Suspended. Observer is no longer accepting from this source.",
  run: suspendSourceAction,
};

const RESUME: Operation = {
  id: "resume",
  label: "Resume",
  kicker: "Reversible",
  title: "Resume this source",
  paragraphs: [
    "Observer begins accepting heartbeats and events from this source again, on the credential it already holds.",
    "The installation flushes its outbox on its next attempt, so whatever it held during the suspension arrives shortly afterwards rather than being lost.",
    "Nothing else changes. Suspension altered no stored event and no credential, so there is nothing to restore.",
  ],
  confirmLabel: "Resume",
  weight: "reversible",
  done: "Resumed. Observer is accepting from this source again.",
  run: resumeSourceAction,
};

const ARCHIVE: Operation = {
  id: "archive",
  label: "Archive",
  kicker: "Terminal",
  title: "Archive this source",
  paragraphs: [
    "This retires the source permanently. Observer stops accepting from it, and it can never afterwards be resumed, suspended, or issued an activation code.",
    "Events already accepted are kept. Archival decides the source's future, not its history — nothing in storage is removed and every figure computed from it stays computable.",
    "The installation keeps whatever is in its outbox and will never be able to deliver it. If that machine is still running, stop it before archiving the source it sends to.",
  ],
  confirmLabel: "Archive permanently",
  weight: "terminal",
  done: "Archived. This source is terminal and nothing further is expected from it.",
  run: archiveSourceAction,
};

const REVOKE: Operation = {
  id: "revoke",
  label: "Revoke credential",
  kicker: "Reversible by reactivation",
  title: "Revoke this source's credential",
  paragraphs: [
    "The credential the installation authenticates with stops working immediately. Its next heartbeat and its next batch are both refused.",
    "The source stays Activated in the record. Activated-then-revoked has to look different from never-activated, so the credential row is kept and marked rather than removed.",
    "The installation keeps its pending events locally, and nothing already accepted is deleted.",
    "To bring the machine back, issue a reactivation code and enter it there. That is a visit to the machine, so revoke only when the credential itself is the problem.",
  ],
  confirmLabel: "Revoke",
  weight: "reversible",
  done: "Revoked. The installation can no longer authenticate until it is reactivated.",
  run: revokeCredentialAction,
};

/**
 * What may be done to a source in the state it is in.
 *
 * Archived returns nothing at all, which is the whole meaning of terminal.
 */
function operationsFor(lifecycle: string, credentialActive: boolean): readonly Operation[] {
  if (lifecycle === "archived") return [];

  const list: Operation[] = [];
  if (lifecycle === "active") list.push(SUSPEND);
  if (lifecycle === "suspended") list.push(RESUME);
  if (credentialActive) list.push(REVOKE);
  list.push(ARCHIVE);
  return list;
}

export function SourceActions({
  sourceId,
  lifecycle,
  credentialActive,
}: {
  readonly sourceId: string;
  readonly lifecycle: string;
  /** A credential exists AND is in the active state — the only revocable case. */
  readonly credentialActive: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Operation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const operations = operationsFor(lifecycle, credentialActive);
  if (operations.length === 0) return null;

  function open(operation: Operation) {
    setChosen(operation);
    setProblem(null);
    setSaid(null);
  }

  function cancel() {
    /* A refusal belongs to the attempt that produced it, not to the next one. */
    if (busy) return;
    setChosen(null);
    setProblem(null);
  }

  function confirm(operation: Operation) {
    setBusy(true);
    setProblem(null);
    void operation.run(sourceId).then((answer) => {
      setBusy(false);
      if (!answer.ok) {
        setProblem(answer.problem ?? "The operation was refused, and gave no reason.");
        return;
      }
      setChosen(null);
      setSaid(operation.done);
      /*
       * The action revalidated its own path; this is what makes THIS page
       * re-render with the new lifecycle. Without it the operator would read
       * the state from before their own press — and the action bar itself is
       * derived from that state, so Suspend would still be offered.
       */
      router.refresh();
    });
  }

  return (
    <div className="mad-lifecycle">
      <div className="mad-actionbar">
        {operations.map((operation) => (
          <button
            key={operation.id}
            className="mad-action"
            type="button"
            data-weight={operation.weight === "terminal" ? "terminal-quiet" : undefined}
            onClick={() => open(operation)}
          >
            {operation.label}
          </button>
        ))}
      </div>

      {/*
       * One dialog, driven by the chosen operation, rather than one per button.
       * Four `<dialog>` elements of which three are always closed is four
       * places for the open state to disagree with itself.
       */}
      <ConfirmDialog
        open={chosen !== null}
        id="source-operation"
        kicker={chosen?.kicker ?? ""}
        title={chosen?.title ?? ""}
        paragraphs={chosen?.paragraphs ?? []}
        confirmLabel={chosen?.confirmLabel ?? ""}
        weight={chosen?.weight ?? "reversible"}
        busy={busy}
        problem={problem}
        onConfirm={() => {
          if (chosen !== null) confirm(chosen);
        }}
        onCancel={cancel}
      />

      <p
        className="mad-said"
        data-tone={said === null ? "quiet" : "good"}
        role="status"
        aria-live="polite"
      >
        {said ?? ""}
      </p>
    </div>
  );
}
