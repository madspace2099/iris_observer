"use client";

import { useEffect, useRef, useState } from "react";

import type { LabActivation, LabEstate, LabScreenProps, LabSource } from "../../lab-data";
import { environmentWord, instant, lifecycleWord, type Reading } from "@/lib/madspace/format";
import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";

/**
 * VARIANT A, THE HANDOVER. CANONICAL LIGHT, ON PAPER.
 *
 * The fourth screen of the same direction, built from the same parts as the
 * three before it: one masthead, one gutter, a head whose first line carries
 * the state and whose second is the answer, the colophon rail of three quiet
 * facts, the section head at 18rem/1fr, and one bordered panel divided by
 * hairlines. Nothing is invented; what changes is what the panels hold.
 *
 * ## Why this screen is a client component
 *
 * One control on it really runs. `navigator.clipboard.writeText` is the whole
 * reason: a copy button that does not copy would make the single most important
 * moment in the product a picture of itself, and a reviewer cannot judge
 * whether the confirmation is noticeable by looking at a confirmation that
 * never appears. Every other control here is drawn and inert, and the screen
 * says so in words rather than by greying anything out.
 *
 * ## The one shadow this direction has
 *
 * The sheet forbids elevation everywhere, because nothing on a paper surface
 * floats. A modal does. This is the only screen in the direction that renders
 * one, so `--dla-shadow-modal` is declared beside it and used nowhere else.
 *
 * ## Why the dialog is on a stage rather than over a scrim
 *
 * The reviewer is judging five screens from five images. A dialog rendered as a
 * true overlay would hand them one image of a dialog and nothing of the screen
 * underneath, and dismissing it to photograph the rest would be photographing a
 * state the product never actually shows. So the dialog is presented as itself,
 * at its own measure, on the tint the system reserves for wells. It carries the
 * modal shadow because it IS the modal, and the caption above it says where it
 * appears.
 *
 * ## The sample
 *
 * `estate.activation.sampleCode` is the one value in the lab not read from the
 * database, and it cannot be: the plaintext exists on the server for the length
 * of one return statement and is never stored. That is stated on the screen, in
 * the panel, beside the code, because a sample that is not labelled is a sample
 * somebody eventually carries to a machine.
 */
export function ActivationA({ estate, screenName, variantName }: LabScreenProps) {
  const source = estate.source;
  const activation = estate.activation;
  const { status } = source.view;

  return (
    <div className="dla-root">
      <header className="dla-masthead">
        <div className="dla-gutter dla-masthead-row">
          <span className="dla-masthead-mark">IRIS Observer</span>
          <span className="dla-masthead-where">MADSPACE operations</span>
          <span className="dla-masthead-lab">
            {screenName}, variant A, {variantName}
          </span>
        </div>
      </header>

      {/*
       * A div, not a `main`, for the reason the three screens before it state:
       * the route above owns the document outline, and two elements answering
       * to one landmark is a broken outline whichever of them is right.
       */}
      <div className="dla-gutter">
        <header className="dla-head">
          <div className="dla-head-top">
            <p className="dla-kicker">Activation</p>
            <CredentialChip activation={activation} />
          </div>

          <div className="dla-head-grid">
            <div>
              <h1 className="dla-title">{status.display_label}</h1>
              <p className="dla-answer">{activationAnswer(activation)}</p>
            </div>

            {/*
             * The slot the other screens give to the page's one filled control
             * is spent here on the sentence that qualifies every control below
             * it. The filled control on this screen lives inside the dialog, at
             * the one moment the code can still be taken, and a second filled
             * button in the head would take that meaning away from it.
             */}
            <div className="dla-actions">
              <p className="dla-actions-note">
                Every control on this screen is drawn and inert, with one exception. Copy, inside
                the code panel, really writes to the clipboard.
              </p>
            </div>
          </div>

          <dl className="dla-rail">
            <div>
              <dt>Project</dt>
              <dd>{source.projectName ?? "Unknown project"}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{environmentWord(status.environment)}</dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>
                <StatusMark tone={lifecycleTone(status.state)} />
                <span>{lifecycleWord(status.state)}</span>
              </dd>
            </div>
          </dl>
        </header>

        <TheCode estate={estate} />

        <Record activation={activation} source={source} />

        <Operations activated={activation.credential !== null} />
      </div>

      <div className="dla-gutter dla-foot">
        <p>
          Development instrument. One credential record, read through the same control plane the
          live screen reads, beside a code that is a labelled sample because the real one exists for
          the length of one return statement and is never stored.
        </p>
      </div>
    </div>
  );
}

/* --- the state in the first line ---------------------------------------------------- */

/** Lifecycle to mark, agreeing with `HEALTH_TONE` and with the three screens before it. */
function lifecycleTone(state: string): MarkTone {
  if (state === "active") return "good";
  if (state === "suspended") return "operator";
  if (state === "archived") return "settled";
  return "wrong";
}

/**
 * The credential's own word, or the fact that there has never been one.
 *
 * `credentialWord` prints "Not set" for an empty state, which is the right
 * answer for a column holding nothing and the wrong one for a source that has
 * simply never been activated. The two are different facts, so the absent case
 * takes the word the rest of this direction already uses for it and the ring,
 * which in this system means nothing is wrong and we are waiting on the
 * installation.
 */
function CredentialChip({ activation }: { activation: LabActivation }) {
  if (activation.credential === null) {
    return <StatusChip tone="await">Never activated</StatusChip>;
  }
  return <StatusChip tone={activation.tone}>{activation.state}</StatusChip>;
}

/**
 * The head's sentence: the state of the credential, and what it means next.
 *
 * Composed from the credential row and nothing else, so it cannot disagree with
 * the four dates rendered under it. It carries no count, because there is
 * nothing here to count: this screen holds one credential.
 */
function activationAnswer(activation: LabActivation): string {
  const credential = activation.credential;
  if (credential === null) {
    return "No credential has ever been issued for this installation. The next code is a first activation, it is carried to the machine by a person, and it is shown at the moment it is issued and never again.";
  }

  const issued = instant(credential.created_at, "Not recorded");
  const on = issued.missing ? "" : ` on ${issued.text}`;

  if (credential.revoked_at !== null) {
    const at = instant(credential.revoked_at, "Not recorded");
    const when = at.missing ? "" : ` on ${at.text}`;
    return `This credential was revoked${when}. The source stays Activated in the record, and the installation cannot authenticate again until somebody enters a reactivation code at the machine.`;
  }

  if (credential.superseded_at !== null) {
    const at = instant(credential.superseded_at, "Not recorded");
    const when = at.missing ? "" : ` on ${at.text}`;
    return `This credential was superseded${when} by a later one. The row is kept so that activated and then replaced looks different from never activated.`;
  }

  const expiry =
    credential.expires_at === null
      ? "No expiry is set on it."
      : `It expires on ${instant(credential.expires_at, "Not recorded").text}.`;

  return `A credential is held for this installation, issued${on}. ${expiry} The code that minted it was shown once, at the moment of issue, and exists nowhere now.`;
}

/* --- a value, and the absence of one ------------------------------------------------ */

/**
 * Identical to the three screens before it. A measurement is a figure; an
 * absence is a word matched to the field, and it changes size, weight, colour
 * and figure style at once so it cannot be mistaken for one.
 */
function Value({ reading }: { reading: Reading }) {
  if (reading.missing) {
    return (
      <span className="dla-absent">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return <span className="dla-figure">{reading.text}</span>;
}

function Field({ label, reading }: { label: string; reading: Reading }) {
  return (
    <div className="dla-field">
      <dt>{label}</dt>
      <dd>
        <Value reading={reading} />
      </dd>
    </div>
  );
}

/**
 * A word the record holds, in the same cell shape as a measurement.
 *
 * Deliberately NOT routed through `Value`. A source's label and an
 * environment's name are not measurements, they can never be absent in the way
 * a heartbeat can, and wrapping them in a `Reading` with `missing: false` would
 * be inventing the half of that pair that carries all the meaning. So they take
 * their own treatment: value size and ink, and no tabular figures, because
 * nothing here is a column of numerals to align.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="dla-field">
      <dt>{label}</dt>
      <dd>
        <span className="dla-plain">{value}</span>
      </dd>
    </div>
  );
}

/* --- the code, once ------------------------------------------------------------------ */

function TheCode({ estate }: { estate: LabEstate }) {
  const activation = estate.activation;
  const { status } = estate.source.view;
  const purpose = activation.credential === null ? "Activation" : "Reactivation";

  return (
    <section className="dla-section" aria-labelledby="dla-code-heading">
      <div className="dla-section-head">
        <h2 id="dla-code-heading">The code, once</h2>
        <p className="dla-section-lede">
          Issuing a code opens one dialog, and the dialog is the only place the plaintext ever
          exists on a screen. It is presented here at its own measure rather than over a dimmed
          page, so the whole screen can be read in one image, and it carries the only shadow this
          direction has.
        </p>
      </div>

      <div className="dla-stage">
        <div className="dla-dialog" role="group" aria-labelledby="dla-dialog-title">
          <header className="dla-dialog-head">
            <p className="dla-micro">Shown once</p>
            <h3 className="dla-dialog-title" id="dla-dialog-title">
              {purpose} code
            </h3>
            {/*
             * The most important sentence on the screen, and it is set like it.
             * Lead size, ink, its opening clause at 700, directly under the
             * title and above everything it qualifies.
             */}
            <p className="dla-once">
              <strong>This code is shown only once.</strong> Copy it now and enter it in the
              installation. The plaintext exists on the server for the length of one return
              statement and is never stored, so closing this without copying means issuing another.
            </p>
          </header>

          <div className="dla-dialog-body">
            {/*
             * The label without which this panel would be dangerous. It sits
             * above the code rather than under it, because a reader who has
             * already copied a value has stopped reading.
             */}
            <p className="dla-sample">
              <StatusChip tone="none">Sample value</StatusChip>
              {/*
               * The sentence carries its own class rather than being addressed
               * as "the span in here". `StatusChip` is a span too, and a rule
               * written that loosely gave the chip the sentence's `flex-grow`
               * and stretched a pill across the whole strip.
               */}
              <span className="dla-sample-note">
                Drawn for this review, and the one value in the lab not read from the database. It
                grants nothing and no installation will accept it. Every other figure on this screen
                is the real credential record.
              </span>
            </p>

            <CodeBlock code={activation.sampleCode} />

            {/*
             * A data panel at the dialog's measure: two columns, labels
             * reserving two lines so the values share a baseline. The four
             * facts are the ones an operator reads back down a phone line
             * before the installer types anything, and the selector is
             * deliberately not among them.
             */}
            <dl className="dla-fields" data-shape="dialog">
              <Fact label="Source" value={status.display_label} />
              <Fact label="Project" value={estate.source.projectName ?? "Unknown project"} />
              <Fact label="Environment" value={environmentWord(status.environment)} />
              <Fact label="Purpose" value={purpose} />
            </dl>
          </div>

          <footer className="dla-dialog-foot">
            <button type="button" className="dla-btn" data-kind="secondary">
              Done
            </button>
            <p className="dla-dialog-note">
              Done is drawn and inert. In the product it drops the plaintext from the client and
              unmounts the element holding it, which is what makes shown once true rather than
              merely stated.
            </p>
          </footer>
        </div>
      </div>
    </section>
  );
}

/**
 * The code, and the one control in this lab that really runs.
 *
 * ## Why the block is ruled
 *
 * Seventy characters of base64url broken at exact character boundaries is four
 * lines of indistinguishable glyphs, and the failure this causes is real: a
 * reader dictating it down a phone line loses which line they were on and
 * repeats one. So alternate lines sit on a 4% tint, aligned to the content box
 * and to the line height, which gives the eye a place to come back to without
 * putting a single character in a different colour from its neighbours.
 *
 * ## Why the code is never broken up
 *
 * It is `obs.<selector>.<secret>` and it is rendered as one string. Splitting
 * it into labelled parts would read beautifully and would teach an operator to
 * name the selector, which is precisely why the live screen does not return it.
 *
 * ## The confirmation
 *
 * A polite live region that is always in the document, so the announcement is
 * not made by the same mutation that inserts the region. It carries a mark, a
 * colour and a spelled-out word, because a confirmation that is only a colour
 * change is not a confirmation. It clears itself after six seconds; the
 * transition it fades in on is neutralised under `prefers-reduced-motion`.
 */
function CodeBlock({ code }: { code: string }) {
  const [said, setSaid] = useState<{ word: string; tone: MarkTone } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function announce(word: string, tone: MarkTone) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setSaid({ word, tone });
    timer.current = window.setTimeout(() => setSaid(null), 6000);
  }

  function copy() {
    /*
     * `navigator.clipboard` is absent outside a secure context and its write
     * can be refused by permission, so both failures land in the same branch
     * and both say what the reader can do instead. A copy button that silently
     * did nothing would be worse than one that was never offered.
     */
    void (async () => {
      try {
        await navigator.clipboard.writeText(code);
        announce("Copied to the clipboard", "good");
      } catch {
        announce(
          "The clipboard is unavailable, so click the code once to select all of it",
          "wrong",
        );
      }
    })();
  }

  return (
    <div className="dla-codeblock">
      {/*
       * `user-select: all` in the sheet, so one click takes the whole value.
       * The failure mode it removes is an operator dragging across four lines,
       * missing the last three characters, and the machine refusing a code that
       * was issued correctly.
       */}
      <code className="dla-code">{code}</code>

      <div className="dla-copy">
        <button type="button" className="dla-btn" data-kind="primary" onClick={copy}>
          Copy code
        </button>
        <span
          className="dla-copy-said"
          data-said={said === null ? "false" : "true"}
          data-tone={said?.tone ?? "none"}
          role="status"
          aria-live="polite"
        >
          {said === null ? "" : <StatusMark tone={said.tone} />}
          <span>{said?.word ?? ""}</span>
        </span>
      </div>
    </div>
  );
}

/* --- the credential record ------------------------------------------------------------ */

/**
 * Four dates, and every absent one is a word matched to its own field.
 *
 * Not one shared "Not recorded" across the four. A credential with no expiry
 * and a credential that has not been revoked are different facts about
 * different columns, and a reader scanning the row has to be able to tell which
 * of them is being reported.
 */
function Record({ activation, source }: { activation: LabActivation; source: LabSource }) {
  const credential = activation.credential;

  return (
    <section className="dla-section" aria-labelledby="dla-credential-heading">
      <div className="dla-section-head">
        <h2 id="dla-credential-heading">The credential record</h2>
        <p className="dla-section-lede">
          What the control plane holds about the credential itself, and it holds this whether the
          machine ever speaks again or not. A date that is not set says which date it is, because a
          credential with no expiry and a credential that has not been revoked are two different
          facts.
        </p>
      </div>

      <div className="dla-panel">
        {credential === null ? (
          <div className="dla-empty">
            <p className="dla-empty-title">No credential has ever been issued</p>
            <p className="dla-empty-note">
              There is no row to date, revoke or supersede. A source waits in this state until
              somebody carries an activation code to the machine and enters it in the plugin.
            </p>
          </div>
        ) : (
          <>
            <div className="dla-group">
              <p className="dla-group-title">Held by the control plane</p>
              <dl className="dla-fields">
                <Field label="Issued" reading={instant(credential.created_at, "Not recorded")} />
                <Field label="Expires" reading={instant(credential.expires_at, "No expiry set")} />
                <Field
                  label="Superseded"
                  reading={instant(credential.superseded_at, "Not superseded")}
                />
                <Field label="Revoked" reading={instant(credential.revoked_at, "Not revoked")} />
              </dl>
            </div>

            {/*
             * The closing band, and the reason this section is not a badge.
             *
             * The credential's word and the installation's verdict are two
             * independent facts and all of the combinations occur: a credential
             * reads Active while the machine has said nothing for days, and
             * revoking it would not move the verdict an inch. The verdict here
             * comes from the shared table and from nowhere else.
             */}
            <div className="dla-group">
              <p className="dla-group-title">What the credential does not say</p>
              <div className="dla-aside">
                <div className="dla-aside-mark">
                  <StatusChip tone={source.healthTone}>{source.healthLabel}</StatusChip>
                </div>
                <p className="dla-aside-note">
                  That is the installation&rsquo;s own verdict, and it is a separate fact from the
                  credential state above it. A credential proves that an exchange completed. It says
                  nothing about whether the machine has run since, and revoking it would not change
                  the verdict beside this sentence.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* --- the operations ------------------------------------------------------------------- */

interface Operation {
  readonly id: string;
  /** What KIND of operation it is. The mark and the word carry the same meaning. */
  readonly kind: string;
  readonly kindTone: MarkTone;
  /**
   * The row's subject, naming the thing acted on.
   *
   * Deliberately not the button's own words. A first draft put the label in the
   * row title AND on the control, so every row read "Suspend" twice across one
   * grid line, which is the kind of duplication that makes a reader stop
   * trusting that the two are different things. The title says what the
   * operation is ABOUT and the control says what pressing it does, which is the
   * split the live component already makes between its dialog title and its
   * button.
   */
  readonly title: string;
  /** On the control. A verb, in the imperative. */
  readonly label: string;
  /** The one sentence an operator needs before pressing. */
  readonly sentence: string;
  readonly weight: "primary" | "secondary" | "tertiary";
}

/**
 * The five operations, grouped by what they cost to undo.
 *
 * The hierarchy is carried by four things and colour is not one of them. The
 * constructive operation is the only filled control on the screen outside the
 * dialog. The reversible ones keep a border. The terminal one loses its border,
 * which is the reference's rule for a pair that must never read as equals, and
 * it sits alone under its own rule at the end. Beside every label is the KIND,
 * as a shape and a spelled-out word from the same vocabulary the states use:
 * the diamond for something a person decided and a person can undo, the square
 * for something terminal and accepted, the ring for a wait handed to the
 * installer.
 *
 * A red button was considered and refused. Red on this surface always carries a
 * state, and a control painted with a state colour is the one piece of colour
 * on the page that means nothing.
 */
function operationGroups(activated: boolean): readonly {
  readonly title: string;
  readonly operations: readonly Operation[];
}[] {
  return [
    {
      title: "Issuing a credential",
      operations: [
        {
          id: "generate",
          kind: "Waits on the installer",
          kindTone: "await",
          title: activated ? "Issue a reactivation code" : "Issue the first activation code",
          label: activated ? "Generate reactivation code" : "Generate activation code",
          sentence: activated
            ? "This source has been activated before, so the next code is recorded as a reactivation, and like every code it is used once, it lapses quickly, and it mints the credential the installation then holds."
            : "The code is used once, it lapses quickly, it is accepted without authentication, and it mints the first credential this installation will hold.",
          weight: "primary",
        },
      ],
    },
    {
      title: "Reversible operations",
      operations: [
        {
          id: "suspend",
          kind: "Reversible",
          kindTone: "operator",
          title: "Suspend this source",
          label: "Suspend",
          sentence:
            "Observer stops accepting heartbeats and events from this source, the installation keeps its pending events in its own outbox, and nothing already accepted is deleted.",
          weight: "secondary",
        },
        {
          id: "resume",
          kind: "Reversible",
          kindTone: "operator",
          title: "Resume this source",
          label: "Resume",
          sentence:
            "Observer begins accepting again on the credential the source already holds, and the installation flushes whatever its outbox kept during the suspension.",
          weight: "secondary",
        },
        {
          id: "revoke",
          kind: "Reversible by reactivation",
          kindTone: "operator",
          title: "Revoke this source’s credential",
          label: "Revoke credential",
          sentence:
            "The credential stops working immediately while the source stays Activated in the record, so the machine comes back only when somebody carries a reactivation code to it.",
          weight: "secondary",
        },
      ],
    },
    {
      title: "Terminal, and offered last",
      operations: [
        {
          id: "archive",
          kind: "Terminal",
          kindTone: "settled",
          title: "Archive this source",
          label: "Archive",
          sentence:
            "This retires the source permanently, everything already accepted is kept, and whatever the installation still holds in its outbox can never be delivered.",
          weight: "tertiary",
        },
      ],
    },
  ];
}

function Operations({ activated }: { activated: boolean }) {
  return (
    <section className="dla-section" aria-labelledby="dla-operations-heading">
      <div className="dla-section-head">
        <h2 id="dla-operations-heading">What may be done to this source</h2>
        <p className="dla-section-lede">
          Every control below is drawn and inert, and pressing one does nothing at all. In the
          product only the operations valid in the current state are offered, so Suspend and Resume
          never appear together; all five are drawn here so the hierarchy can be judged at once.
          Suspension is an operator&rsquo;s decision rather than a health verdict, which is why it
          wears the diamond and not a fault colour.
        </p>
      </div>

      <div className="dla-panel">
        {operationGroups(activated).map((group) => (
          <div key={group.title} className="dla-opgroup">
            <p className="dla-group-title">{group.title}</p>
            {group.operations.map((operation) => (
              <div key={operation.id} className="dla-op">
                <div className="dla-op-id">
                  <p className="dla-op-kind">
                    <StatusMark tone={operation.kindTone} />
                    <span>{operation.kind}</span>
                  </p>
                  <p className="dla-op-name">{operation.title}</p>
                </div>
                <p className="dla-op-note">{operation.sentence}</p>
                <div className="dla-op-do">
                  <button type="button" className="dla-btn" data-kind={operation.weight}>
                    {operation.label}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
