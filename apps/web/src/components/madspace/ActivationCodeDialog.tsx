"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { InfoNote } from "@/components/madspace/InfoNote";
import { ModalDialog } from "@/components/madspace/ConfirmDialog";
import { StatusChip, type MarkTone } from "@/components/madspace/StatusMark";
import { duration, instant } from "@/lib/madspace/format";
import { issueActivationCodeAction } from "@/lib/madspace/source-actions";

/**
 * THE ONE MOMENT ON THIS SURFACE THAT HANDS OVER A SECRET.
 *
 * An activation code is accepted unauthenticated and mints a long-lived,
 * source-scoped credential. It exists on the server for the length of one
 * return statement, is never stored in a recoverable form, and is shown to an
 * operator exactly once because the whole point of it is that a person carries
 * it to a machine.
 *
 * Everything about this component follows from that.
 *
 * ## Where the plaintext lives, and where it is dropped
 *
 * It lives in ONE place: the `issued` state below. It is not in a ref, not in
 * `localStorage`, not in a URL, not in the receipt, and not in any value that
 * survives the dialog.
 *
 * **It is dropped in `dismiss()`** — `setIssued(null)`. Because `ModalDialog`
 * mounts its children only while open, that one call both clears the client
 * state and unmounts the `<code>` element, so the text is gone from the
 * document as well as from React. What remains is `receipt`, which is built in
 * `issue()` from the two instants and the purpose and never touches `code`.
 *
 * Two honest limits, stated rather than papered over. If the operator pressed
 * Copy, the code is on their clipboard, which is the entire purpose of the
 * button and not something a web page should be quietly undoing. And a code
 * already carried to a machine is live until it is used or expires; dismissing
 * this dialog is not a revocation and does not pretend to be one.
 *
 * ## What the page shows afterwards
 *
 * Metadata, and only metadata: issued at, expires at, and a status. Never the
 * code, never the verifier — which no screen can reach — and deliberately never
 * the selector, which `issueActivationCodeAction` does not even return. A
 * surface that displays credential internals teaches an operator to read them,
 * and the next thing that happens is somebody pasting one into a support
 * thread.
 */

type Issued = Extract<Awaited<ReturnType<typeof issueActivationCodeAction>>, { ok: true }>;

/** What survives the dialog. The same shape minus the one field that matters. */
interface Receipt {
  readonly purpose: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

/* --- the status of a code this session issued --------------------------------------- */

/** ISO instants compared as instants. Two precisions sort wrongly as strings. */
function atOrAfter(later: string | null, earlier: string): boolean {
  if (later === null) return false;
  const a = Date.parse(later);
  const b = Date.parse(earlier);
  return Number.isFinite(a) && Number.isFinite(b) && a >= b;
}

/**
 * Unused, Consumed, Revoked or Expired — each derived from something persisted.
 *
 * There is no read for an activation code's row, so none of this is guessed at:
 * consuming a code is the only thing in the system that mints a credential, so
 * a credential whose `created_at` falls at or after this code was issued is
 * that code having been used. Revocation is read from the same row. Expiry is
 * the expiry this server stated, against the clock.
 *
 * The credential instants arrive from the last server render of the page, so
 * "Unused" means unused as at that read. That is why `dismiss` refreshes: a
 * code carried to a machine and entered there becomes Consumed on the next read
 * rather than by anything this component decides.
 *
 * `detail` is what changes what the operator does next; what the four words
 * MEAN is a definition, and definitions live behind the disclosure beside the
 * label. Consumed is the one status with nothing left to say once its own word
 * is on the screen.
 */
function codeStatus(
  receipt: Receipt,
  credentialCreatedAt: string | null,
  credentialRevokedAt: string | null,
  now: number,
): { readonly word: string; readonly tone: MarkTone; readonly detail: string } {
  if (atOrAfter(credentialRevokedAt, receipt.issuedAt)) {
    return {
      word: "Revoked",
      /* A person revoked it, and a person can issue another. Not a fault. */
      tone: "operator",
      detail: "The credential this code minted has since been revoked.",
    };
  }
  if (atOrAfter(credentialCreatedAt, receipt.issuedAt)) {
    return {
      word: "Consumed",
      tone: "good",
      detail: "",
    };
  }
  const expires = Date.parse(receipt.expiresAt);
  if (Number.isFinite(expires) && now >= expires) {
    return {
      word: "Expired",
      tone: "wrong",
      detail: "It was never exchanged, and it can no longer be. Issue another.",
    };
  }
  return {
    word: "Unused",
    /* The ring: nothing is wrong, and we are waiting on the installation. */
    tone: "await",
    detail: "As at the last read of this page.",
  };
}

/**
 * What the four status words mean, once, beside the label they qualify.
 *
 * Written out here rather than beside each status because it is a definition of
 * the vocabulary and not a fact about this code, and because Unused and
 * Consumed are the pair a reader actually has to tell apart.
 */
function StatusMeaning() {
  return (
    <InfoNote label="what each status means" align="end">
      <p>
        <strong>Consumed</strong> means an installation exchanged this code for a credential.
      </p>
      <p>
        <strong>Unused</strong> means no credential has been minted since it was issued.
      </p>
    </InfoNote>
  );
}

/** "in 12 min", or how long ago it lapsed. Never a bare timestamp on its own. */
function relativeToNow(iso: string, now: number): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const seconds = Math.round(Math.abs(at - now) / 1000);
  return at >= now ? `in ${duration(seconds)}` : `${duration(seconds)} ago`;
}

/* --- the component ------------------------------------------------------------------- */

export function ActivationCodeDialog({
  sourceId,
  sourceLabel,
  activated,
  lifecycle,
  credentialCreatedAt,
  credentialRevokedAt,
}: {
  readonly sourceId: string;
  readonly sourceLabel: string;
  /** A credential row exists, so the next code is a REACTIVATION and says so. */
  readonly activated: boolean;
  readonly lifecycle: string;
  readonly credentialCreatedAt: string | null;
  readonly credentialRevokedAt: string | null;
}) {
  const router = useRouter();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  /*
   * Archival is terminal and the service enforces it, so there is nothing to
   * offer here. A disabled button would be a control that exists to be refused.
   */
  if (lifecycle === "archived") return null;

  const word = activated ? "reactivation" : "activation";

  function issue() {
    /*
     * The trigger is marked busy rather than DISABLED, and the guard is here
     * instead.
     *
     * Disabling the button the operator just pressed takes focus off it — a
     * disabled element cannot hold focus — and focus lands on `<body>`. The
     * dialog then opens with nothing to return to, so dismissing it with the
     * keyboard drops the operator at the top of the document. `aria-disabled`
     * says the same thing to assistive technology, keeps the element focusable,
     * and makes this guard the thing that actually prevents a second issuance.
     */
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setSaid(null);
    void issueActivationCodeAction(sourceId).then((answer) => {
      setBusy(false);
      if (!answer.ok) {
        setProblem(answer.problem);
        return;
      }
      setIssued(answer);
      /* Built here, from the answer, without ever reading `answer.code`. */
      setReceipt({
        purpose: answer.purpose,
        issuedAt: answer.issuedAt,
        expiresAt: answer.expiresAt,
      });
    });
  }

  /** THE DROP POINT. After this call the plaintext is in neither state nor DOM. */
  function dismiss() {
    setIssued(null);
    setSaid(null);
    /*
     * Re-read the page so the credential instants behind the receipt's status
     * are current. Nothing this component holds is re-fetched; the refresh is
     * for the server-rendered facts the status is derived from.
     */
    router.refresh();
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setSaid("Activation code copied to the clipboard.");
    } catch {
      setSaid("The clipboard is unavailable here. Select the code above and copy it.");
    }
  }

  const now = Date.now();
  const expiresRelative = issued === null ? null : relativeToNow(issued.expiresAt, now);

  return (
    <div className="mad-issue">
      {/*
       * NOT filled. The filled button in this component is Copy, inside the
       * dialog, at the one moment the code can still be taken; two filled
       * buttons would make the surface's strongest treatment mean nothing at
       * the moment it has to mean something.
       */}
      <div className="mad-actionbar">
        <button className="mad-action" type="button" onClick={issue} aria-disabled={busy}>
          {busy ? "Generating…" : `Generate ${word} code`}
        </button>
        <InfoNote
          label={activated ? "why the next code is a reactivation" : "what an activation code is"}
        >
          {activated ? (
            <p>
              This source has been activated before, so the next code is recorded as a reactivation.
              A machine that was reimaged and came back is not a first activation.
            </p>
          ) : (
            <p>
              Single-use and short-lived. It is accepted unauthenticated and mints the long-lived
              credential the installation then uses.
            </p>
          )}
        </InfoNote>
      </div>

      {problem === null ? null : (
        <p className="mad-said" data-tone="weak" role="alert">
          <StatusChip tone="wrong">Refused</StatusChip> {problem}
        </p>
      )}

      {receipt === null ? null : (
        <IssuedReceipt
          receipt={receipt}
          credentialCreatedAt={credentialCreatedAt}
          credentialRevokedAt={credentialRevokedAt}
          now={now}
        />
      )}

      <ModalCode
        issued={issued}
        sourceLabel={sourceLabel}
        expiresRelative={expiresRelative}
        said={said}
        onCopy={copy}
        onDismiss={dismiss}
      />
    </div>
  );
}

/* --- the dialog ---------------------------------------------------------------------- */

function ModalCode({
  issued,
  sourceLabel,
  expiresRelative,
  said,
  onCopy,
  onDismiss,
}: {
  readonly issued: Issued | null;
  readonly sourceLabel: string;
  readonly expiresRelative: string | null;
  readonly said: string | null;
  readonly onCopy: (code: string) => Promise<void>;
  readonly onDismiss: () => void;
}) {
  /*
   * "Not stated" rather than the formatter's default "Never". A code always
   * expires; a missing value here means this screen was not told when, which is
   * a different fact from one that never lapses.
   */
  const expires = issued === null ? null : instant(issued.expiresAt, "Not stated");

  return (
    <ModalDialog open={issued !== null} onDismiss={onDismiss} labelledBy="activation-code-title">
      {issued === null ? null : (
        <>
          <header className="mad-dialog-head">
            <h2 className="mad-dialog-title" id="activation-code-title">
              Activation code
            </h2>
          </header>

          <div className="mad-dialog-body">
            {/*
             * `user-select: all` in the sheet, so one click takes the whole
             * value. The code is seventy characters of base64url and selecting
             * it by dragging is where an operator loses the last three.
             */}
            <code className="mad-activation-code">{issued.code}</code>

            <div className="mad-activation-actions">
              <button
                className="mad-action"
                type="button"
                data-weight="primary"
                data-autofocus=""
                onClick={() => void onCopy(issued.code)}
              >
                Copy
              </button>
              {/*
               * Polite and always present. A live region added to the document
               * at the same moment its text appears is not reliably announced,
               * and a confirmation that is only a colour change is not a
               * confirmation at all.
               */}
              <span className="mad-copy-said" role="status" aria-live="polite">
                {said ?? ""}
              </span>
            </div>

            {/*
             * The data panel: a 1px grid over a border-coloured ground, with
             * two lines reserved for every label so the values share a baseline
             * however long a label gets.
             */}
            <dl className="mad-datapanel">
              <div>
                <dt>Source</dt>
                <dd>{sourceLabel}</dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{issued.purpose === "reactivation" ? "Reactivation" : "Activation"}</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd data-missing={expires?.missing === true ? "true" : undefined}>
                  {expires?.text ?? "Not stated"}
                  {expiresRelative === null ? null : (
                    <span className="mad-activation-aside"> · {expiresRelative}</span>
                  )}
                </dd>
              </div>
            </dl>

            <p className="mad-once">
              This code is shown only once. Copy it now and enter it in the installation; once this
              dialog is closed it cannot be shown again, and a replacement has to be issued.
            </p>
          </div>

          <footer className="mad-dialog-foot">
            <button className="mad-action" type="button" onClick={onDismiss}>
              Done
            </button>
          </footer>
        </>
      )}
    </ModalDialog>
  );
}

/* --- what is left afterwards ---------------------------------------------------------- */

function IssuedReceipt({
  receipt,
  credentialCreatedAt,
  credentialRevokedAt,
  now,
}: {
  readonly receipt: Receipt;
  readonly credentialCreatedAt: string | null;
  readonly credentialRevokedAt: string | null;
  readonly now: number;
}) {
  const status = codeStatus(receipt, credentialCreatedAt, credentialRevokedAt, now);
  /*
   * Both instants carry `missing` through to the markup rather than being
   * flattened to a string. An absent instant is a different fact from a
   * recorded one and the panel renders it differently; discarding the half of
   * the pair that says so is how a missing value starts reading as a real one.
   * "Not stated" rather than "Never", because a code always expires.
   */
  const issuedAt = instant(receipt.issuedAt, "Not stated");
  const expiresAt = instant(receipt.expiresAt, "Not stated");
  const expiresRelative = relativeToNow(receipt.expiresAt, now);

  return (
    <dl className="mad-datapanel">
      <div>
        <dt>Issued</dt>
        <dd data-missing={issuedAt.missing ? "true" : undefined}>{issuedAt.text}</dd>
      </div>
      <div>
        <dt>Expires</dt>
        <dd data-missing={expiresAt.missing ? "true" : undefined}>
          {expiresAt.text}
          {expiresRelative === null ? null : (
            <span className="mad-activation-aside"> · {expiresRelative}</span>
          )}
        </dd>
      </div>
      <div>
        <dt>
          Status
          <StatusMeaning />
        </dt>
        <dd>
          <StatusChip tone={status.tone}>{status.word}</StatusChip>
          {status.detail === "" ? null : (
            <span className="mad-activation-aside"> · {status.detail}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
