"use client";

import { useEffect, useRef, useState } from "react";

import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import {
  ageSince,
  environmentWord,
  instant,
  lifecycleWord,
  percent,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT C, ACTIVATION AND SOURCE ACTIONS. HYBRID EXECUTIVE.
 *
 * The same frame, the same seam, the same rule about what stands on which
 * ground. Graphite holds what we CONCLUDE about the credential and what an
 * operator may DO about it; the paper plate holds what was MEASURED, which
 * here is four instants on a credential row and the three states of the machine
 * that credential authenticates.
 *
 * ## Why the action region is on graphite
 *
 * Source detail puts its three lifecycle controls in the masthead's right hand
 * column, on graphite, because the seam is a rule about content: above it, what
 * we conclude and what a person may do; below it, the evidence. This screen's
 * subject IS what a person may do, so the corner grows into a full width
 * region and keeps every part of the vocabulary it had — the micro label, the
 * `.dlc-btn` hierarchy, the inert line underneath. It is drawn with the same
 * 1px cell division as `.dlc-scope` and `.dlc-panel`, so an operations panel and
 * a data panel are visibly the same object with a control where the value goes.
 *
 * The consequence is that the evidence for choosing between the five sits BELOW
 * the buttons, on paper. That is this direction's argument working rather than
 * failing: an operator who wants to know why one of them is the right press
 * looks down, and the ground changing is the instruction.
 *
 * ## Why this screen shows a modal, and why it takes a shadow
 *
 * The system spends its two shadows on the popover and the modal, and this is
 * the modal. The interaction being designed is genuinely one moment: a code
 * appears once, is carried to a machine, and is never shown again. A panel in
 * the page flow would say the opposite — that it is a thing you can scroll back
 * to.
 *
 * It is a real `<dialog>` opened with `showModal()`, for the reasons
 * `ConfirmDialog` sets out: the page behind goes inert, Tab cannot leave, the
 * panel is in the top layer, and Escape is intercepted rather than observed
 * because the `close` event was not dispatched at all in the runtime this
 * surface was reviewed in.
 *
 * The panel takes the PAPER tokens. It is the one thing on the screen a person
 * has to transcribe, and it is a plate lifted off the mount rather than part of
 * the frame.
 *
 * ## What works, and what does not
 *
 * Copy works. It is `navigator.clipboard.writeText` and a transient
 * confirmation, and it is real behaviour rather than a drawn state, because a
 * copy control whose confirmation is a picture teaches nothing about whether
 * the confirmation is noticeable. The confirmation animates only where motion
 * is welcome.
 *
 * The five operations are inert. Every one is `type="button"` with no handler
 * and nothing imported from `source-actions`, and the line under the panel says
 * so on the screen.
 *
 * The one other working control is the lab affordance that brings the sample
 * panel back. It is fenced off in its own block, labelled as a lab control, and
 * it says in words that the product has no such thing.
 */

/** Lifecycle is a decision rather than a health reading, and its marks say so. */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

/**
 * A value, or the word that stands where a value is not.
 *
 * The same branch every screen in this variant draws: the size drops from the
 * 19px value step to body, the weight drops to regular, the ink drops to the
 * metadata grey, and the bar mark goes in front of it. `missing` is never
 * ignored and never becomes a dash.
 */
function Value({ reading }: { reading: Reading }) {
  if (!reading.missing) return <span className="dlc-value">{reading.text}</span>;

  return (
    <span className="dlc-value" data-missing="true">
      <StatusMark tone="none" />
      <span>{reading.text}</span>
    </span>
  );
}

/** One labelled reading, with the relative age under it where there is one. */
function Fact({ label, reading, age }: { label: string; reading: Reading; age?: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Value reading={reading} />
        {age === undefined || age === null ? null : <span className="dlc-age">{age}</span>}
      </dd>
    </div>
  );
}

/* --- the five operations ------------------------------------------------------------- */

/**
 * What may be done, and the one sentence an operator needs before pressing it.
 *
 * The `weight` word is what distinguishes the terminal operation from the
 * reversible ones by something other than colour, and it is the first thing in
 * the cell rather than a footnote to it. Archive additionally stands alone on
 * the last row of the panel, because the operation with no inverse should not
 * be one of four things in a line.
 *
 * The sentences are the consequences the live `SourceActions` states in its
 * confirmations, compressed to the one a reader needs to choose between the
 * five. None of them is a definition, so none of them belongs behind the
 * disclosure.
 */
interface Operation {
  readonly id: string;
  readonly label: string;
  /** Reversible, terminal, or reversible only by a visit to the machine. */
  readonly weight: string;
  readonly kind: "primary" | "secondary" | "destructive";
  readonly note: string;
}

const OPERATIONS: readonly Operation[] = [
  {
    id: "issue",
    label: "Generate reactivation code",
    weight: "Shown once",
    kind: "primary",
    note: "Mints a short lived code that an installer enters on the machine itself. It is shown once, it is never stored, and a code nobody copied has to be replaced by another.",
  },
  {
    id: "revoke",
    label: "Revoke credential",
    weight: "Reversible by reactivation",
    kind: "secondary",
    note: "The credential stops working immediately and the source stays Activated in the record. Bringing the installation back means carrying a new code to it, so revoke only when the credential itself is the problem.",
  },
  {
    id: "suspend",
    label: "Suspend",
    weight: "Reversible",
    kind: "secondary",
    note: "Observer stops accepting heartbeats and events. The installation holds what it has locally and delivers it when the source is resumed. Nothing already accepted is deleted.",
  },
  {
    id: "resume",
    label: "Resume",
    weight: "Reversible",
    kind: "secondary",
    note: "Observer begins accepting again, on the credential the installation already holds. Its outbox flushes on the next attempt, so what it held during the suspension arrives shortly afterwards.",
  },
  {
    id: "archive",
    label: "Archive",
    weight: "Terminal",
    kind: "destructive",
    note: "This retires the source permanently and cannot be undone. Events already accepted are kept, and whatever is in the installation's outbox will never be delivered, so stop that machine before archiving the source it sends to.",
  },
];

function OperationCell({ operation }: { operation: Operation }) {
  return (
    <div data-weight={operation.weight === "Terminal" ? "terminal" : "reversible"}>
      <p className="dlc-op-weight">{operation.weight}</p>
      {/*
       * INERT, DELIBERATELY. `type="button"`, no handler, and nothing imported
       * from an action module. What is being reviewed is the hierarchy: one
       * filled control, three bordered ones, and the destructive treatment
       * spent only on the operation that has no inverse.
       */}
      <button type="button" className="dlc-btn" data-kind={operation.kind}>
        {operation.label}
      </button>
      <p className="dlc-op-note">{operation.note}</p>
    </div>
  );
}

/* --- the code panel ------------------------------------------------------------------- */

/** What the copy control said last, as a shape, a colour and a spelled out word. */
interface Said {
  readonly tone: MarkTone;
  readonly text: string;
}

/**
 * The one moment on this surface that hands over a secret.
 *
 * A real `<dialog>`, opened with `showModal()`, with three departures from
 * simply trusting the platform, all of them argued in `ConfirmDialog`:
 *
 *   - Escape is intercepted and `preventDefault`ed, so React performs every
 *     close through one observable path.
 *   - The landing point is chosen rather than inherited: focus goes to Copy,
 *     which is the control that exists for the one thing this moment is for.
 *   - Focus is returned to whatever opened it, if that element is still in the
 *     document.
 *
 * The children are mounted only while it is open, so the code is out of the
 * document as well as out of React once it is dismissed. That is a property the
 * real dialog needs and this one keeps, because a prototype that models the
 * moment without modelling the drop is modelling the easy half.
 */
function CodePanel({
  open,
  code,
  sourceLabel,
  purpose,
  onDismiss,
}: {
  readonly open: boolean;
  readonly code: string;
  readonly sourceLabel: string;
  readonly purpose: string;
  readonly onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [said, setSaid] = useState<Said | null>(null);

  /* The latest closure, so the listener below subscribes once and still calls it. */
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  /* Whether React still believes it is open, so a dismissal cannot be reported twice. */
  const isOpen = useRef(open);
  isOpen.current = open;

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    const escaped = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isOpen.current) return;
      event.preventDefault();
      dismiss.current();
    };
    const closed = () => {
      if (isOpen.current) dismiss.current();
    };

    element.addEventListener("keydown", escaped);
    element.addEventListener("close", closed);
    return () => {
      element.removeEventListener("keydown", escaped);
      element.removeEventListener("close", closed);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;

    if (open) {
      if (!element.open) {
        returnTo.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        element.showModal();
        element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
      }
      return;
    }

    if (element.open) element.close();
    setSaid(null);
    const target = returnTo.current;
    returnTo.current = null;

    /*
     * The trigger may have been re-rendered away; focusing a detached node
     * silently sends focus to the body.
     */
    if (target !== null && target !== document.body && document.contains(target)) {
      target.focus();
      return;
    }

    /*
     * NOTHING TO RETURN TO IS STILL SOMEWHERE TO GO.
     *
     * The panel opens on load here, so on the first dismissal there is no
     * trigger to restore: `document.activeElement` was the body when it
     * opened, and handing focus back to the body leaves a keyboard reader at
     * the top of the document with no idea where they were. The control that
     * reopens the panel is the honest destination — it is what they would
     * press next — so focus goes there instead.
     */
    document.querySelector<HTMLElement>("[data-reopen]")?.focus();
  }, [open]);

  /* A pending confirmation belongs to the press that produced it and to no later one. */
  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function announce(next: Said) {
    setSaid(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(null), 8000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      announce({ tone: "good", text: "Copied. The sample code is on the clipboard." });
    } catch {
      /* The triangle: the clipboard refused, and the reader now has work to do. */
      announce({
        tone: "wrong",
        text: "The clipboard is unavailable here. Select the code above and copy it.",
      });
    }
  }

  return (
    <dialog
      className="dlc-dialog"
      ref={dialog}
      aria-labelledby="dlc-code-title"
      onClick={(event) => {
        if (event.target === dialog.current) onDismiss();
      }}
    >
      {open ? (
        <div className="dlc-dialog-panel dlc-paper">
          <header className="dlc-dialog-head">
            <p className="dlc-kicker">Design lab</p>
            <h2 className="dlc-dialog-title" id="dlc-code-title">
              Activation code
            </h2>
            {/*
             * THE SAMPLE, LABELLED WHERE NOBODY CAN MISS IT.
             *
             * The bar mark, because this is the one value in the lab that was
             * not read from anything: a real code exists on the server for the
             * length of one return statement, so there is nothing to read and
             * nothing was. It sits above the code rather than under it, since a
             * caption underneath is read after the thing it qualifies.
             */}
            <div className="dlc-sample">
              <StatusChip tone="none">Sample, not a credential</StatusChip>
              <p>
                Drawn for review, and the only value in this lab not read from the control plane. It
                authenticates nothing and it will never be accepted anywhere.
              </p>
            </div>
          </header>

          <div className="dlc-dialog-body">
            <p className="dlc-micro">The code</p>
            {/*
             * `user-select: all` in the sheet, so one click takes the whole
             * value: a real code is seventy characters and dragging across it
             * is where an operator loses the last three. The measure is capped
             * in characters and the leading is opened, so the lines a reader
             * says out loud stay the same length and stay findable.
             */}
            <code className="dlc-code">{code}</code>
            <p className="dlc-code-guide">
              Three parts, separated by full stops: the prefix obs, then the selector, then the
              secret.
            </p>

            <div className="dlc-copy-row">
              <button
                type="button"
                className="dlc-btn"
                data-kind="primary"
                data-autofocus=""
                onClick={() => void copy()}
              >
                Copy the code
              </button>
              {/*
               * Polite, and always in the document. A live region added at the
               * same moment its text appears is not reliably announced, and a
               * confirmation that is only a colour change is not a confirmation
               * at all: this one carries a mark, a word and a sentence.
               */}
              <span className="dlc-copy-said" role="status" aria-live="polite">
                {said === null ? (
                  ""
                ) : (
                  <span className="dlc-copy-note" data-tone={said.tone}>
                    <StatusMark tone={said.tone} />
                    <span>{said.text}</span>
                  </span>
                )}
              </span>
            </div>

            {/*
             * THE MOST IMPORTANT SENTENCE ON THE SCREEN.
             *
             * At the heading step, at full ink, against a rule, and above the
             * metadata rather than below it. The rule is drawn in ink rather
             * than in a state colour: nothing has gone wrong here, and colour on
             * this surface means status.
             */}
            <div className="dlc-once">
              <p className="dlc-once-title">This code is shown only once.</p>
              <p className="dlc-once-note">
                Copy it now and enter it in the installation. The plaintext exists on the server for
                the length of one return statement and is never stored, so closing this panel is the
                end of it: nobody can show it again, and a replacement has to be issued.
              </p>
            </div>

            <dl className="dlc-panel" data-cols="2">
              <div>
                <dt>Source</dt>
                <dd>
                  <span className="dlc-value">{sourceLabel}</span>
                </dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>
                  <span className="dlc-value">{purpose}</span>
                </dd>
              </div>
            </dl>
          </div>

          <footer className="dlc-dialog-foot">
            <button type="button" className="dlc-btn" data-kind="secondary" onClick={onDismiss}>
              Done
            </button>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}

/* --- the answer ----------------------------------------------------------------------- */

/**
 * The credential in one sentence, composed from the row and nothing else.
 *
 * Every branch names the state, then what it means for the installation, then
 * the date where one is persisted. Nothing here claims a state the record does
 * not carry, and a state this surface has never heard of says so rather than
 * being flattened into one of the four it knows.
 */
function credentialAnswer(state: string, word: string, issued: Reading): string {
  if (state === "") {
    return "No credential has ever been issued for this source. Nothing can authenticate until an activation code is issued here and entered on the machine itself.";
  }

  const when = issued.missing ? "at a time this surface cannot read" : `on ${issued.text}`;

  if (state === "active") {
    return `Activated ${when}, and the credential is still active. The code that minted it was shown once, was never stored, and cannot be recovered.`;
  }
  if (state === "revoked") {
    return `Activated ${when}, then revoked. The source stays Activated in the record, and the installation cannot authenticate again until somebody carries a reactivation code to it.`;
  }
  if (state === "superseded") {
    return `Activated ${when}, then superseded by a later credential. The row is kept so that activated and then replaced does not look like never activated.`;
  }
  if (state === "expired") {
    return `Activated ${when}, and the credential has since expired. The installation cannot authenticate until a reactivation code is entered on the machine.`;
  }
  return `The credential state reads ${word}, which this surface does not recognise. Nothing has been inferred from it, and nothing below is derived from it.`;
}

/**
 * The middle state, in three words rather than two.
 *
 * The same function Project detail declares. A source that connected and went
 * quiet is a different situation from one that has never been heard from, and
 * both wear the ring, because both are waits and nothing is wrong with a
 * showroom machine switched off overnight.
 */
function connectionState(connected: boolean, fresh: boolean): { word: string; tone: MarkTone } {
  if (!connected) return { word: "Never connected", tone: "await" };
  return fresh ? { word: "Connected", tone: "good" } : { word: "Offline", tone: "await" };
}

/**
 * Whether the source's one word verdict adds anything on this screen.
 *
 * `classifyHealth` puts lifecycle above liveness deliberately, so on a suspended
 * or archived source the verdict repeats the word the scope band has already
 * printed, and on an offline one it repeats the connection chip two cells to its
 * left. Project detail suppresses exactly these three for exactly this reason,
 * and drawing them here would put "Offline" twice on one panel and make a
 * deliberate precedence read as a stutter.
 *
 * The word and the mark, when it IS drawn, come from the shared table by way of
 * the estate. Nothing on this screen decides what a verdict is called.
 */
function verdictAdds(health: string): boolean {
  return health !== "suspended" && health !== "archived" && health !== "offline";
}

/* --- the screen ----------------------------------------------------------------------- */

export function ActivationC({ estate, variantName }: LabScreenProps) {
  const name = variantName;
  const activation = estate.activation;
  const credential = activation.credential;
  const source = estate.source;
  const { status, operations, states } = source.view;

  /*
   * The panel opens with the screen, because the moment it draws is the moment
   * a code appears. Dismissing it reveals what the product shows afterwards,
   * which is metadata and only metadata.
   */
  const [panelOpen, setPanelOpen] = useState(true);

  /*
   * The four instants on the credential row. Every absence is a word matched to
   * its own field: a credential with no expiry says so, and a credential that
   * was never revoked says that instead of showing an empty cell.
   */
  const issued = instant(credential?.created_at ?? null, "Not recorded");
  const expires = instant(credential?.expires_at ?? null, "No expiry set");
  const superseded = instant(credential?.superseded_at ?? null, "Not superseded");
  const revoked = instant(credential?.revoked_at ?? null, "Not revoked");
  const issuedAge = ageSince(credential?.created_at ?? null, estate.now);

  const answer = credentialAnswer(credential?.state ?? "", activation.state, issued);
  const lifecycle = lifecycleWord(status.state);

  const heartbeat = instant(operations?.last_heartbeat_at ?? null);
  const heartbeatAge = ageSince(operations?.last_heartbeat_at ?? null, estate.now);
  const verified = instant(operations?.ingestion_verified_at ?? null);
  const connection = connectionState(states.connected, source.view.heartbeatFresh);
  const fill = percent(source.view.queueFillPercent);
  const purpose = states.activated ? "Reactivation" : "Activation";
  const showVerdict = verdictAdds(source.view.health);

  return (
    <div className="dlc-root dlc-graphite">
      <a className="dlc-skip" href="#dlc-work">
        Skip to the credential record
      </a>

      <div className="dlc-frame">
        <div className="dlc-rail">
          <p className="dlc-rail-mark">
            IRIS Observer <span>MADSPACE operations</span>
          </p>
          <p className="dlc-rail-lab">Design lab &middot; Variant C &middot; {name}</p>
        </div>

        <header>
          {/*
           * One column rather than two. Source detail keeps its controls in the
           * masthead's right hand corner because they are not its subject; here
           * they ARE the subject, so the corner would be the wrong size for
           * them and the region below is where they go.
           */}
          <div className="dlc-mast-grid">
            <div className="dlc-mast-text">
              <p className="dlc-kicker">Credential</p>
              <h1 className="dlc-title">Activation</h1>
              <p className="dlc-answer">{answer}</p>
              <div className="dlc-verdict">
                <StatusChip tone={activation.tone}>{activation.state}</StatusChip>
                <span className="dlc-verdict-note">
                  The credential's own lifecycle. It is not the source's health: a revoked
                  credential leaves the source Activated in the record, and the three states below
                  say what the machine is actually doing.
                </span>
              </div>
            </div>
          </div>

          {/* --- the action region ------------------------------------------ */}
          <section className="dlc-ops-region" aria-labelledby="dlc-operations">
            <div className="dlc-ops-head">
              <h2 id="dlc-operations" className="dlc-ops-title">
                Source actions
              </h2>
              <p className="dlc-ops-lede">
                Five operations, and the differences between them are the reason this region exists.
                Suspension is an operator's decision rather than a health state, and it is
                reversible. Revoking ends the credential relationship while the source stays
                Activated in the record. Archival is terminal.
              </p>
            </div>

            <div className="dlc-ops">
              {OPERATIONS.map((operation) => (
                <OperationCell key={operation.id} operation={operation} />
              ))}
            </div>

            <p className="dlc-ops-note">
              All five are inert in the design lab. Every one is a button with no handler, and the
              product offers only the operations valid in the state a source is actually in, so
              Suspend and Resume never stand together there. All five are drawn here so the
              hierarchy can be judged at once.
            </p>

            {/*
             * The lab affordance, fenced off from the operations above it.
             *
             * It is a control the product does not have and must never have, so
             * it does not stand in the panel with the five that are real. What
             * it says in words is the thing the panel it reopens is about.
             */}
            <div className="dlc-lab">
              <p className="dlc-micro">Design lab control</p>
              <button
                type="button"
                className="dlc-btn"
                data-kind="secondary"
                data-reopen="true"
                onClick={() => setPanelOpen(true)}
              >
                Show the sample code panel
              </button>
              <p className="dlc-lab-note">
                This one works, and so does Copy inside the panel. There is no such control in the
                product: a code that has been dismissed is gone, and the only way back is to issue
                another.
              </p>
            </div>
          </section>

          {/*
           * The scope band: whose source this credential authenticates, in which
           * environment, whether it is switched on at all, and the identifier.
           * The last graphite element, sharing the plate's outer edge.
           */}
          <dl className="dlc-scope">
            <div>
              <dt>Source</dt>
              <dd>
                <span className="dlc-value">{status.display_label}</span>
              </dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>
                <span className="dlc-value">{environmentWord(status.environment)}</span>
              </dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>
                <span className="dlc-value dlc-inline">
                  <StatusMark tone={LIFECYCLE_TONE[lifecycle] ?? "none"} />
                  <span>{lifecycle}</span>
                </span>
              </dd>
            </div>
            <div>
              <dt>Source identifier</dt>
              <dd>
                <span className="dlc-id">{status.source_id}</span>
              </dd>
            </div>
          </dl>
        </header>

        <div id="dlc-work" className="dlc-plate dlc-paper">
          {/* --- the credential record -------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-record">
            <div className="dlc-region-head">
              <h2 id="dlc-record">The credential record</h2>
              <p className="dlc-lede">
                What survives the moment above: four instants and a state word. The code itself is
                not here and never can be, because it was never stored. Every field on this panel is
                optional in the record, so an empty one is a word matched to that field rather than
                a blank.
              </p>
              <details className="dlc-note">
                <summary>What each state word means</summary>
                <dl className="dlc-note-body">
                  <div>
                    <dt>Active</dt>
                    <dd>
                      The installation can authenticate with it now. It is the only state in which
                      revoking is offered.
                    </dd>
                  </div>
                  <div>
                    <dt>Revoked</dt>
                    <dd>
                      A person ended it. The row is kept rather than deleted, because activated and
                      then revoked has to look different from never activated.
                    </dd>
                  </div>
                  <div>
                    <dt>Superseded</dt>
                    <dd>
                      A later credential replaced it. A machine that was reimaged and came back is
                      not a first activation.
                    </dd>
                  </div>
                  <div>
                    <dt>Expired</dt>
                    <dd>
                      It lapsed against the expiry this server stated. It was never revoked and
                      never replaced; it simply ran out.
                    </dd>
                  </div>
                </dl>
              </details>
            </div>

            {credential === null ? (
              <div className="dlc-empty">
                <p className="dlc-empty-title">No credential has ever been issued</p>
                <p className="dlc-empty-note">
                  A source is registered here and then activated from the machine it runs on, so a
                  new one sits in this state until somebody carries a code to it. There is no record
                  to show yet, and that is a wait rather than a fault.
                </p>
              </div>
            ) : (
              <dl className="dlc-panel">
                <Fact label="Issued" reading={issued} age={issuedAge} />
                <Fact label="Expires" reading={expires} />
                <Fact label="Superseded" reading={superseded} />
                <Fact label="Revoked" reading={revoked} />
              </dl>
            )}
          </section>

          {/* --- what the machine is doing ---------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-installation">
            <div className="dlc-region-head">
              <h2 id="dlc-installation">What the installation is doing right now</h2>
              <p className="dlc-lede">
                The evidence for choosing between the five operations above. Three states in three
                words, never collapsed into one mark, and the readings that prove each of them.
                Archival strands whatever the outbox is holding, so the outbox is on this panel.
              </p>
            </div>

            {/*
             * THREE STATES, AS THREE WORDS IN THREE CELLS.
             *
             * On the data panel the whole variant already uses, at three
             * columns, so the states and the readings that prove them are
             * visibly two rows of one object. They are never collapsed into one
             * dot, one percentage or one bar: an operator about to archive this
             * source needs to see that it is activated and offline at the same
             * time, and a single mark is exactly what would hide that.
             */}
            <dl className="dlc-panel" data-cols="3">
              <div>
                <dt>Activation</dt>
                <dd>
                  <StatusChip tone={states.activated ? "good" : "await"}>
                    {states.activated ? "Activated" : "Not activated"}
                  </StatusChip>
                </dd>
              </div>
              <div>
                <dt>Connection</dt>
                <dd>
                  <StatusChip tone={connection.tone}>{connection.word}</StatusChip>
                </dd>
              </div>
              <div>
                <dt>Ingestion</dt>
                <dd>
                  <StatusChip tone={states.ingestionVerified ? "good" : "await"}>
                    {states.ingestionVerified ? "Verified" : "Not verified"}
                  </StatusChip>
                </dd>
              </div>
            </dl>

            <dl className="dlc-panel" data-cols={showVerdict ? undefined : "3"}>
              <Fact label="Last heartbeat" reading={heartbeat} age={heartbeatAge} />
              <Fact label="Ingestion verified" reading={verified} />
              <Fact label="Outbox fill" reading={fill} />
              {/*
               * The verdict, and only where it says something the three states
               * above have not already said. On this source it would print
               * "Offline" a second time, so it is not printed at all.
               */}
              {showVerdict ? (
                <div>
                  <dt>Source verdict</dt>
                  <dd>
                    <span className="dlc-value dlc-inline">
                      <StatusMark tone={source.healthTone} />
                      <span>{source.healthLabel}</span>
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>

            <p className="dlc-hint">
              The source's one word verdict is drawn on this panel only where it says something the
              three states above have not already said, and it is never a score across them. Its
              word and its mark come from the one table every screen in this lab reads.
            </p>
          </section>
        </div>

        <footer className="dlc-foot">
          <p>Development instrument. Nothing on this route writes to the control plane.</p>
        </footer>
      </div>

      <CodePanel
        open={panelOpen}
        code={activation.sampleCode}
        sourceLabel={`${status.display_label} (${sourceTypeWord(status.source_type)})`}
        purpose={purpose}
        onDismiss={() => setPanelOpen(false)}
      />
    </div>
  );
}
