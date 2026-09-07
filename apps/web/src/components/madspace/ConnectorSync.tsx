"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/madspace/ConfirmDialog";
import { StatusChip } from "@/components/madspace/StatusMark";
import {
  removeCredentialAction,
  syncConnectorAction,
  syncDealsAction,
} from "@/lib/madspace/connector-actions";

/**
 * Sync now, and forget the credential — the two operations on a configured
 * connector, offered only when they are valid, with the result said in a
 * sentence beside the button rather than in a toast that leaves.
 *
 * ## Forgetting asks first
 *
 * A forgotten credential cannot be shown or recovered; the operator pastes a
 * new one, which means asking the client for it again. One press or one key
 * on an underlined word is not enough to spend that, so the press opens the
 * same confirmation the source lifecycle uses, with the consequences in
 * sentences and Cancel under the returning key. The trigger keeps its quiet
 * look: beside Sync now it is the less frequent half of the pair, and the
 * dialog is where the weight is.
 *
 * ## The sentence outlives the buttons
 *
 * The status line is rendered whenever the bar is, empty until it has
 * something to say, so a screen reader is already watching the region when
 * the sentence arrives. And it stays after forgetting: the refresh removes
 * both buttons, and a component that returned nothing at that point took the
 * answer with it.
 */
export function ConnectorSync({
  projectId,
  kind,
  name,
  canSync,
  canSyncDeals = false,
  hasCredential,
}: {
  readonly projectId: string;
  readonly kind: string;
  readonly name: string;
  readonly canSync: boolean;
  /** A CRM whose deals this product can pull: Lomnio's leads, a Monday deals board. */
  readonly canSyncDeals?: boolean;
  readonly hasCredential: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!canSync && !hasCredential && said === null) return null;

  function forget() {
    start(async () => {
      const result = await removeCredentialAction(projectId, kind);
      if (!result.ok) {
        /* The refusal lands inside the dialog, where the press happened. */
        setProblem(result.problem ?? "Nothing changed.");
        return;
      }
      setConfirming(false);
      setSaid({ ok: true, text: "The credential was forgotten." });
      router.refresh();
    });
  }

  return (
    <div className="mad-actionbar">
      {canSync ? (
        <button
          className="mad-button"
          data-emphasis="secondary"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await syncConnectorAction(projectId, kind);
              setSaid({ ok: result.ok, text: result.summary });
              router.refresh();
            })
          }
        >
          {pending ? `Syncing ${name}…` : "Sync now"}
        </button>
      ) : null}
      {canSync && canSyncDeals ? (
        <button
          className="mad-button"
          data-emphasis="secondary"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await syncDealsAction(projectId, kind);
              setSaid({ ok: result.ok, text: result.summary });
              router.refresh();
            })
          }
        >
          {pending ? `Syncing ${name}…` : "Sync deals now"}
        </button>
      ) : null}
      {hasCredential ? (
        <button
          className="mad-quiet"
          type="button"
          disabled={pending}
          onClick={() => {
            setProblem(null);
            setConfirming(true);
          }}
        >
          Forget credential
        </button>
      ) : null}
      <p className="mad-said" role="status" aria-live="polite">
        {said === null ? (
          ""
        ) : (
          <>
            <StatusChip tone={said.ok ? "good" : "wrong"}>
              {said.ok ? "Done" : "Refused"}
            </StatusChip>{" "}
            {said.text}
          </>
        )}
      </p>

      <ConfirmDialog
        open={confirming}
        id={`${kind}-forget`}
        kicker="Reversible by pasting a new credential"
        title={`Forget the ${name} credential`}
        paragraphs={[
          "The stored credential is removed from this server. It cannot be shown or recovered afterwards.",
          `Sync now and the daily schedule stop for ${name} until a new credential is pasted into ${name} settings.`,
          "The settings, the current catalogue and the recorded changes are kept.",
        ]}
        confirmLabel="Forget credential"
        weight="reversible"
        busy={pending}
        problem={problem}
        onConfirm={forget}
        onCancel={() => {
          if (pending) return;
          setConfirming(false);
          setProblem(null);
        }}
      />
    </div>
  );
}
