"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { StatusChip } from "@/components/madspace/StatusMark";
import { removeCredentialAction, syncConnectorAction } from "@/lib/madspace/connector-actions";

/**
 * Sync now, and forget the credential — the two operations on a configured
 * connector, offered only when they are valid, with the result said in a
 * sentence beside the button rather than in a toast that leaves.
 */
export function ConnectorSync({
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

  if (!canSync && !hasCredential) return null;

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
      {hasCredential ? (
        <button
          className="mad-quiet"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await removeCredentialAction(projectId, kind);
              setSaid({
                ok: result.ok,
                text: result.ok
                  ? "The credential was forgotten."
                  : (result.problem ?? "Nothing changed."),
              });
              router.refresh();
            })
          }
        >
          Forget credential
        </button>
      ) : null}
      {said === null ? null : (
        <p className="mad-said" role="status">
          <StatusChip tone={said.ok ? "good" : "wrong"}>{said.ok ? "Done" : "Refused"}</StatusChip>{" "}
          {said.text}
        </p>
      )}
    </div>
  );
}
