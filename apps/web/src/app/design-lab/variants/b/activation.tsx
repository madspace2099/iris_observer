"use client";

import { Fragment, useEffect, useRef, useState, type RefObject } from "react";

import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import {
  environmentWord,
  instant,
  lifecycleWord,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT B. GRAPHITE CONSOLE. THE MOMENT A CODE IS ISSUED, AND WHAT MAY BE
 * DONE TO THE SOURCE AFTERWARDS.
 *
 * The same surface as the three screens before it: graphite ground, the raised
 * colour for anything that LABELS, the panel colour for anything that ANSWERS,
 * a 1px division over the grid colour, the 1/8/12/20/28 rhythm, the 40/24/16
 * gutters and the 1440 cap. The masthead, the section heads, the ledger, the
 * ruled list, the bands and the chips are the ones the other four screens
 * already use, and nothing here is drawn a second way.
 *
 * ## Why this screen is a client component, and the only one that is
 *
 * Exactly one control on it has to WORK: Copy. A code that cannot be copied is
 * a code an operator transcribes by eye down a phone line, and the transient
 * confirmation is the difference between having it and believing you have it.
 * A handler needs a client component, a client component needs its own module,
 * and this direction owns two modules. So the module is the client boundary and
 * everything else on it is static markup, which is what a server component
 * would have produced anyway.
 *
 * ## The one shadow
 *
 * The system allows two, popover and modal, and every panel in this direction
 * has carried none. The code panel takes the modal shadow because it is the one
 * thing on this surface that is genuinely floating over the page rather than
 * laid into it, and because what is underneath must read as unreachable while
 * it is open. It is also `inert` underneath, so that reading is true rather
 * than atmospheric.
 *
 * ## Why the panel opens on load
 *
 * It is the moment being designed. A screen that hid it behind a press would be
 * judged without it. Closing it drops the code from the document exactly as the
 * live dialog does, which leaves the resting state visible below, and the
 * masthead control brings the moment back. That control is labelled as a design
 * lab control, because it is one: nothing is issued and nothing is minted.
 *
 * An outside click does NOT close it. Everywhere else that is the right
 * behaviour; here closing destroys the only copy of a secret, so it takes a
 * deliberate press or the Escape key.
 *
 * ## The code is a SAMPLE, and the screen says so three times
 *
 * `estate.activation.isSample` is typed `true`, so the label is unconditional
 * rather than a branch that could only ever go one way. It is stated in the
 * panel's own band, it is stated under the code, and the code's middle segment
 * spells it out in its own characters. This is the single value in the lab that
 * is not read from the database and it cannot be: the plaintext exists on the
 * server for the length of one return statement and is never stored.
 *
 * ## The action region does nothing
 *
 * Five operations, every one `type="button"` with no handler, on the one screen
 * in this direction that could have carried one. They are ordered by what they
 * cost rather than by how often they are pressed, split into bands that state
 * the cost, and each carries the sentence an operator needs before pressing.
 */

/** Lifecycle to mark, keyed by the word `lifecycleWord` prints. Shared with Source detail. */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

/**
 * A measurement, or the fact that there is none.
 *
 * The pair of treatments this direction draws everywhere. An absent value drops
 * the value size, the medium weight and the tabular figures, and carries the
 * neutral bar, which this system draws for "no measurement exists" and never
 * for a zero.
 */
function Value({ reading }: { reading: Reading }) {
  if (reading.missing) {
    return (
      <span className="dlb-absent">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return <span className="dlb-value">{reading.text}</span>;
}

/* --- the code ------------------------------------------------------------------- */

/**
 * The code, broken where it is safe to break it.
 *
 * `obs.<selector>.<secret>` is sixty-eight characters and a reader has to be
 * able to say it out loud without losing their place. So the two full stops
 * become the preferred wrapping points: each segment keeps its own trailing
 * stop and a `<wbr>` follows it, which offers the browser a break there before
 * it resorts to breaking mid-token.
 *
 * It stays ONE text flow inside ONE `<code>` element rather than three blocks,
 * and that is deliberate: three blocks would put newlines where the stops
 * belong the moment somebody selected the value by hand, and a credential
 * pasted with a line break in it is a support call. `<wbr>` contributes no
 * character to a copy, so what leaves this element is exactly what the server
 * minted.
 */
function CodeText({ code }: { code: string }) {
  const segments = code.split(".");
  return (
    <code className="dlb-code">
      {segments.map((segment, index) => {
        const last = index === segments.length - 1;
        return (
          <Fragment key={segment}>
            {last ? segment : `${segment}.`}
            {last ? null : <wbr />}
          </Fragment>
        );
      })}
    </code>
  );
}

/** What the copy attempt said. A word and a shape, never a colour on its own. */
interface Said {
  readonly tone: MarkTone;
  readonly word: string;
  readonly text: string;
}

function CodePanel({
  code,
  sourceLabel,
  purpose,
  onDismiss,
  copyRef,
}: {
  code: string;
  sourceLabel: string;
  purpose: string;
  onDismiss: () => void;
  copyRef: RefObject<HTMLButtonElement | null>;
}) {
  const [said, setSaid] = useState<Said | null>(null);

  /*
   * The confirmation is transient, and eight seconds is chosen so a reader who
   * looked away still sees it. It is a word and a mark rather than a flash, so
   * it survives `prefers-reduced-motion`, where the entrance animation is the
   * only thing that goes.
   */
  useEffect(() => {
    if (said === null) return;
    const timer = window.setTimeout(() => setSaid(null), 8000);
    return () => window.clearTimeout(timer);
  }, [said]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setSaid({ tone: "good", word: "Copied", text: "The code is on your clipboard." });
    } catch {
      /*
       * A refusal is a state like any other, so it takes a word and a shape
       * too, and it says what to do instead rather than reporting a failure.
       */
      setSaid({
        tone: "wrong",
        word: "Not copied",
        text: "The clipboard is unavailable here. Select the code above and copy it.",
      });
    }
  }

  return (
    <div className="dlb-scrim">
      <div
        className="dlb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlb-once-title"
        aria-describedby="dlb-once-lead"
      >
        <div className="dlb-modal-head">
          <p className="dlb-eyebrow">Activation code</p>
          {/*
           * THE MOST IMPORTANT SENTENCE ON THE SCREEN IS THE TITLE.
           *
           * Not a footnote under the code and not a caption beside the button.
           * A reader who closes this without copying has to issue another, so
           * the fact that it is shown once is the heading, and the consequence
           * is the paragraph directly under it.
           */}
          <h2 className="dlb-modal-title" id="dlb-once-title">
            Shown only once
          </h2>
          <p className="dlb-modal-lead" id="dlb-once-lead">
            Copy it now and enter it in the installation. The plaintext exists on the server for the
            length of one return statement and is never stored, so once this panel is closed the
            code cannot be shown again and a replacement has to be issued.
          </p>
        </div>

        <div className="dlb-modal-body">
          {/*
           * The sample label, stated before the code rather than after it. It
           * is unconditional: `isSample` is typed `true`, so a branch here
           * could only ever go one way and would read as though a real code
           * might sometimes appear on this screen.
           */}
          <div className="dlb-sample">
            <StatusChip tone="none">Sample</StatusChip>
            <p className="dlb-sample-text">
              Drawn for review, not read from the database. It grants nothing, no installation will
              accept it, and its middle segment spells out what it is.
            </p>
          </div>

          <CodeText code={code} />
          <p className="dlb-codenote">
            Three parts joined by full stops: a prefix, a selector and a secret. Read it in those
            three pieces.
          </p>

          <div className="dlb-copyrow">
            {/*
             * The one filled control at this moment, and the only control in
             * this direction that does anything. `dlb-btn` is the same button
             * the other four screens draw.
             */}
            <button
              className="dlb-btn"
              data-kind="primary"
              type="button"
              onClick={() => void copy()}
              ref={copyRef}
            >
              Copy the code
            </button>
            {/*
             * Polite, and always in the document. A live region inserted at the
             * same moment its text appears is not reliably announced, and a
             * confirmation that is only a colour change is not a confirmation.
             */}
            <span className="dlb-said" role="status" aria-live="polite" data-said={said !== null}>
              {said === null ? null : (
                <>
                  <StatusChip tone={said.tone}>{said.word}</StatusChip>
                  <span>{said.text}</span>
                </>
              )}
            </span>
          </div>

          <div className="dlb-ledger">
            <div className="dlb-cell">
              <p className="dlb-cell-label">Source</p>
              <p className="dlb-cell-value">
                <span className="dlb-value">{sourceLabel}</span>
              </p>
              <p className="dlb-cell-note">The installation this code activates.</p>
            </div>
            <div className="dlb-cell">
              <p className="dlb-cell-label">Purpose</p>
              <p className="dlb-cell-value">
                <span className="dlb-value">{purpose}</span>
              </p>
              <p className="dlb-cell-note">
                A machine that was reimaged and came back is not a first activation.
              </p>
            </div>
            <div className="dlb-cell dlb-span2">
              <p className="dlb-cell-label">Expires</p>
              <p className="dlb-cell-value">
                {/*
                 * Nothing was issued, so there is no expiry to state. A word
                 * matched to the field and the neutral bar, never a plausible
                 * timestamp invented to fill the cell.
                 */}
                <Value reading={instant(null, "Nothing was issued")} />
              </p>
              <p className="dlb-cell-note">
                A real code is short lived and single use, and states its own expiry here.
              </p>
            </div>
          </div>
        </div>

        <div className="dlb-modal-foot">
          <button className="dlb-btn" data-kind="secondary" type="button" onClick={onDismiss}>
            Done
          </button>
          <p className="dlb-modal-footnote">
            Closing drops the code from this page. An outside click will not do it.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --- the action region ----------------------------------------------------------- */

interface Action {
  readonly id: string;
  /** On the control. A verb, in the imperative. */
  readonly label: string;
  /** What the press costs, before the sentence that says what it does. */
  readonly kicker: string;
  /** The one sentence an operator needs before pressing. */
  readonly sentence: string;
  readonly kind: "primary" | "secondary" | "destructive";
  /**
   * Why there is no control on this row, or null when there is one.
   *
   * A withheld operation is stated in words rather than drawn as a disabled
   * button. A greyed-out Resume beside an active source is a control whose
   * whole contribution is to be refused, and the service refuses it anyway.
   */
  readonly withheld: string | null;
}

interface ActionBand {
  readonly key: string;
  readonly label: string;
  readonly actions: readonly Action[];
}

const SUSPEND: Action = {
  id: "suspend",
  label: "Suspend",
  kicker: "Reversible. An operator's decision, not a health state",
  sentence:
    "Observer stops accepting heartbeats and events from this source. The installation keeps its pending events in its own outbox and delivers them when it is resumed, up to whatever ceiling that outbox has. Nothing is deleted, the credential stays valid, and the record is unchanged.",
  kind: "secondary",
  withheld: null,
};

const RESUME: Action = {
  id: "resume",
  label: "Resume",
  kicker: "Reversible",
  sentence:
    "Observer begins accepting from this source again, on the credential it already holds. The installation flushes its outbox on its next attempt, so whatever it held during the suspension arrives shortly afterwards rather than being lost.",
  kind: "secondary",
  withheld: null,
};

const REVOKE: Action = {
  id: "revoke",
  label: "Revoke credential",
  kicker: "Ends the credential relationship. Reversible only by reactivation",
  sentence:
    "The credential the installation authenticates with stops working immediately, and its next heartbeat and next batch are both refused. The source stays Activated in the record, because activated then revoked has to look different from never activated. Bringing the machine back means issuing a reactivation code and entering it there, which is a visit to the machine.",
  kind: "destructive",
  withheld: null,
};

const ARCHIVE: Action = {
  id: "archive",
  label: "Archive",
  kicker: "Terminal. There is no inverse",
  sentence:
    "This retires the source permanently. Events already accepted are kept and every figure computed from them stays computable, but the installation keeps whatever is in its outbox and will never be able to deliver it. If that machine is still running, stop it before archiving the source it sends to.",
  kind: "destructive",
  withheld: null,
};

function generate(activated: boolean): Action {
  return {
    id: "generate",
    label: activated ? "Generate reactivation code" : "Generate activation code",
    kicker: "Issues a code that is shown once",
    sentence: activated
      ? "Mints a single use, short lived code and shows it once. This source has been activated before, so the next code is recorded as a reactivation. Somebody has to carry it to the machine and enter it there."
      : "Mints a single use, short lived code and shows it once. It is accepted unauthenticated and exchanged for the long lived credential the installation then uses. Somebody has to carry it to the machine and enter it there.",
    kind: "primary",
    withheld: null,
  };
}

/**
 * What may be done, and what may not, in the state this source is actually in.
 *
 * The bands are the argument. Suspension is reversible and is a decision rather
 * than a fault; archival is terminal and sits on its own; and the operation
 * that is not offered right now is stated in words instead of being drawn as a
 * control that would be refused. The precedence mirrors the live surface, where
 * an archived source is offered nothing at all.
 */
function actionBands(
  lifecycle: string,
  activated: boolean,
  credentialActive: boolean,
): ActionBand[] {
  if (lifecycle === "archived") {
    return [
      {
        key: "none",
        label: "Nothing is offered",
        actions: [
          {
            id: "archived",
            label: "No operation is offered",
            kicker: "Terminal",
            sentence:
              "This source is archived. Nothing further is expected from the installation, no operation is offered, and the record is kept for the history rather than for operation.",
            kind: "secondary",
            withheld: "An archived source is offered no operation at all.",
          },
        ],
      },
    ];
  }

  const suspended = lifecycle === "suspended";
  const offered: Action[] = [generate(activated), suspended ? RESUME : SUSPEND];
  if (credentialActive) offered.push(REVOKE);

  const withheld: Action[] = [
    {
      ...(suspended ? SUSPEND : RESUME),
      withheld: suspended
        ? "Not offered while this source is suspended. Suspend returns the moment it is resumed, and the two are never offered together."
        : "Not offered while this source is active. Resume replaces Suspend the moment it is suspended, and the two are never offered together.",
    },
  ];
  if (!credentialActive) {
    withheld.push({
      ...REVOKE,
      withheld: "Not offered. There is no active credential to revoke.",
    });
  }

  return [
    {
      key: "offered",
      label: `Offered while this source is ${lifecycleWord(lifecycle)}`,
      actions: offered,
    },
    { key: "terminal", label: "Terminal. There is no inverse", actions: [ARCHIVE] },
    { key: "withheld", label: "Not offered in this state", actions: withheld },
  ];
}

function ActionRow({ action }: { action: Action }) {
  return (
    <article className="dlb-row">
      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Operation</span>
        <h3 className="dlb-rowname">{action.label}</h3>
        <p className="dlb-rownote">{action.kicker}</p>
      </div>

      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">What the press does</span>
        <p className="dlb-consequence">{action.sentence}</p>
      </div>

      <div className="dlb-rowcell dlb-actioncell">
        <span className="dlb-rowlabel">Control</span>
        {action.withheld === null ? (
          /* Inert. `type="button"` and no handler, on the one screen here that could carry one. */
          <button className="dlb-btn" data-kind={action.kind} type="button">
            {action.label}
          </button>
        ) : (
          <p className="dlb-withheld">{action.withheld}</p>
        )}
      </div>
    </article>
  );
}

/* --- the screen ------------------------------------------------------------------ */

export function ActivationB({ estate, screenName, variantName }: LabScreenProps) {
  const { activation, source } = estate;
  const { status } = source.view;

  const [open, setOpen] = useState(true);
  const copyRef = useRef<HTMLButtonElement | null>(null);
  const showRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  /* Focus into the panel when it opens, and back onto its trigger when it closes. */
  useEffect(() => {
    if (open) copyRef.current?.focus();
    else if (wasOpen.current) showRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const credential = activation.credential;
  const activated = credential !== null;
  const lifecycle = lifecycleWord(status.state);
  const bands = actionBands(status.state, activated, credential?.state === "active");

  return (
    <div className="dlb-root">
      {/*
       * Everything under the panel is inert while it is open, so "unreachable"
       * is a fact about the document rather than an impression made by a scrim.
       */}
      <div inert={open}>
        <header className="dlb-rail">
          <div className="dlb-width dlb-rail-inner">
            <p className="dlb-rail-name">
              MADSPACE Operations <span>{screenName}</span>
            </p>
            <p className="dlb-rail-tag">Design lab / Variant B / {variantName}</p>
          </div>
        </header>

        {/*
         * A div rather than a landmark, for the reason the other four screens
         * give: the MADSPACE shell already renders a main with this id, and a
         * nested main plus a duplicate id is a defect rather than a composition.
         */}
        <div className="dlb-width">
          <div className="dlb-masthead">
            <div>
              <p className="dlb-eyebrow">{sourceTypeWord(status.source_type)}</p>
              <h1 className="dlb-title">{status.display_label}</h1>
              <div className="dlb-meta">
                <span className="dlb-meta-item">
                  <span className="dlb-meta-key">Project</span>
                  <span className="dlb-meta-value">{source.projectName ?? "Unknown project"}</span>
                </span>
                <span className="dlb-meta-item">
                  <span className="dlb-meta-key">Environment</span>
                  <span className="dlb-meta-value">{environmentWord(status.environment)}</span>
                </span>
                <span className="dlb-meta-item">
                  <span className="dlb-meta-key">Lifecycle</span>
                  <StatusChip tone={LIFECYCLE_TONE[lifecycle] ?? "none"}>{lifecycle}</StatusChip>
                </span>
              </div>
            </div>

            <div>
              <div className="dlb-actions">
                {/*
                 * The one control in the masthead, and it is a LAB control
                 * rather than a product one. It reopens the moment; it issues
                 * nothing, mints nothing and writes nothing.
                 */}
                <button
                  className="dlb-btn"
                  data-kind="secondary"
                  type="button"
                  onClick={() => setOpen(true)}
                  ref={showRef}
                >
                  Show the issued code
                </button>
              </div>
              <p className="dlb-inert">Design lab control. It issues nothing</p>
            </div>
          </div>

          {/* --- the resting state: where the code is not --- */}
          <section className="dlb-section" aria-labelledby="dlb-code-heading">
            <div className="dlb-sectionhead">
              <h2 className="dlb-h2" id="dlb-code-heading">
                The activation code
              </h2>
              <p className="dlb-sectionnote">
                Issued once, shown once, and never recoverable afterwards.
              </p>
            </div>

            <div className="dlb-hero">
              <div className="dlb-answerband">
                <div className="dlb-answerband-rail">
                  <p className="dlb-spinelabel">The code</p>
                  <StatusChip tone="none">Not on this page</StatusChip>
                </div>
                <div className="dlb-answerband-body">
                  <div>
                    <p className="dlb-answer">
                      The code is not held here. It appears once, in the panel that opens the moment
                      it is issued, and it is never stored in a form anybody can read back.
                    </p>
                    <p className="dlb-answernote">
                      What survives the panel is the credential record below: the dates, and the
                      state the credential is in. Never the code, never the verifier, and
                      deliberately never the selector.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* --- what is left afterwards --- */}
          <section className="dlb-section" aria-labelledby="dlb-credential-heading">
            <div className="dlb-sectionhead">
              <h2 className="dlb-h2" id="dlb-credential-heading">
                The credential record
              </h2>
              <p className="dlb-sectionnote">
                Four instants and one state. An absent date is a word matched to the field.
              </p>
            </div>

            <div className="dlb-ledger">
              {credential === null ? (
                <div className="dlb-empty">
                  <p className="dlb-emptytitle">No credential has ever been issued</p>
                  <p className="dlb-rownote">
                    This source has never completed an exchange, so there is no record to show. It
                    is the state a source sits in between being registered and being activated on
                    the machine it runs on.
                  </p>
                </div>
              ) : (
                <>
                  <div className="dlb-cell dlb-span2">
                    <p className="dlb-cell-label">State</p>
                    <p className="dlb-cell-value">
                      <StatusChip tone={activation.tone}>{activation.state}</StatusChip>
                    </p>
                    <p className="dlb-cell-note">
                      The credential's own lifecycle. It is not the source's lifecycle and it is not
                      a health verdict.
                    </p>
                  </div>

                  <div className="dlb-cell">
                    <p className="dlb-cell-label">Issued</p>
                    <p className="dlb-cell-value">
                      <Value reading={instant(credential.created_at, "Never issued")} />
                    </p>
                    <p className="dlb-cell-note">
                      When the installation exchanged a code for this credential.
                    </p>
                  </div>

                  <div className="dlb-cell">
                    <p className="dlb-cell-label">Expires</p>
                    <p className="dlb-cell-value">
                      <Value reading={instant(credential.expires_at, "No expiry set")} />
                    </p>
                    <p className="dlb-cell-note">
                      A credential with no expiry runs until it is revoked or superseded.
                    </p>
                  </div>

                  <div className="dlb-cell">
                    <p className="dlb-cell-label">Superseded</p>
                    <p className="dlb-cell-value">
                      <Value reading={instant(credential.superseded_at, "Not superseded")} />
                    </p>
                    <p className="dlb-cell-note">
                      A reactivation replaces the credential the installation was holding.
                    </p>
                  </div>

                  <div className="dlb-cell">
                    <p className="dlb-cell-label">Revoked</p>
                    <p className="dlb-cell-value">
                      <Value reading={instant(credential.revoked_at, "Not revoked")} />
                    </p>
                    <p className="dlb-cell-note">
                      The row is kept and marked rather than removed, so activated then revoked
                      looks different from never activated.
                    </p>
                  </div>

                  <div className="dlb-cell dlb-span2">
                    <p className="dlb-cell-label">Source identifier</p>
                    <p className="dlb-cell-value">
                      <span className="dlb-value">{status.source_id}</span>
                    </p>
                    <p className="dlb-cell-note">Issued by the control plane. It never changes.</p>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* --- what may be done to the source --- */}
          <section className="dlb-section" aria-labelledby="dlb-actions-heading">
            <div className="dlb-sectionhead">
              <h2 className="dlb-h2" id="dlb-actions-heading">
                Source actions
              </h2>
              <p className="dlb-sectionnote">
                Ordered by what a press costs, not by how often it is pressed.
              </p>
            </div>

            {/*
             * The scope band. The system reserves it for anything whose effect
             * reaches beyond the record on the screen, and every operation below
             * reaches the machine in the building rather than this page.
             */}
            <div className="dlb-scope">
              <p className="dlb-spinelabel">These operations reach</p>
              <p className="dlb-scopetext">
                {estate.accountName}, {status.display_label}. The installation itself rather than
                this record: the credential it holds, whether the boundary accepts what it sends,
                and the events it is still holding.
              </p>
            </div>

            <div className="dlb-hero">
              <div className="dlb-table" data-columns="actions">
                {/*
                 * The column rail, `aria-hidden`, because every label it shows
                 * also travels inside the cell it labels, visually hidden while
                 * this is on screen, and it is what remains once the columns
                 * collapse.
                 */}
                <div className="dlb-thead" aria-hidden="true">
                  <p className="dlb-th">Operation</p>
                  <p className="dlb-th">What the press does</p>
                  <p className="dlb-th">Control</p>
                </div>

                {bands.map((band) => (
                  <Fragment key={band.key}>
                    <div className="dlb-band">
                      <p className="dlb-spinelabel">{band.label}</p>
                    </div>
                    {band.actions.map((action) => (
                      <ActionRow key={action.id} action={action} />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>

            <p className="dlb-inert" data-align="start">
              Every control above is inert in the design lab
            </p>
          </section>
        </div>

        <footer className="dlb-foot">
          <div className="dlb-width dlb-foot-inner">
            <span>Design lab / {screenName} / Variant B</span>
            <span>{variantName}</span>
          </div>
        </footer>
      </div>

      {open ? (
        <CodePanel
          code={activation.sampleCode}
          sourceLabel={status.display_label}
          purpose={activated ? "Reactivation" : "Activation"}
          onDismiss={() => setOpen(false)}
          copyRef={copyRef}
        />
      ) : null}
    </div>
  );
}
