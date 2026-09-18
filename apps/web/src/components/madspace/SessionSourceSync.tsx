"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/madspace/ConfirmDialog";
import { StatusChip } from "@/components/madspace/StatusMark";
import {
  removeSessionSourceCredentialAction,
  syncSessionSourceAction,
} from "@/lib/madspace/session-source-actions";

/**
 * Sync now, and forget the credential — the showroom-telemetry mirror of
 * `ConnectorSync`. No deals button: a telemetry source delivers sessions,
 * never a CRM ladder, so there is only ever the one sync to offer.
 */
export function SessionSourceSync({
  projectId,
  kind,
  name,
  canSync,
  hasCredential,
}: {
  readonly projectId: string;
  readonly kind: string;
  readonly name: string;
  readonly canSync: boolean;
  readonly hasCredential: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ readonly ok: boolean; readonly text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);

  if (!canSync && !hasCredential && said === null) return null;

  function forget() {
    start(async () => {
      const result = await removeSessionSourceCredentialAction(projectId, kind);
      if (!result.ok) {
        setProblem(result.problem ?? "Nothing changed.");
        return;
      }
      setConfirming(false);
      setSaid({ ok: true, text: "The credential was forgotten." });
      requestAnimationFrame(() => saidRef.current?.focus());
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
              const result = await syncSessionSourceAction(projectId, kind);
              setSaid({ ok: result.ok, text: result.summary });
              router.refresh();
            })
          }
        >
          {pending ? `Syncing ${name}…` : "Sync now"}
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
      <p className="mad-said" role="status" aria-live="polite" ref={saidRef} tabIndex={-1}>
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
          `Sync now stops working for ${name} until a new key is pasted into its settings.`,
          "The settings and any sessions already imported are kept.",
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
