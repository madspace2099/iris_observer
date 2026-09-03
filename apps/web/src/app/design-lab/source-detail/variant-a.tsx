import type { LabSource } from "../lab-data";
import { labFields, type LabFields } from "./lab-fields";
import type { Reading } from "@/lib/madspace/format";
import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";

/**
 * VARIANT A. CANONICAL LIGHT, ON PAPER.
 *
 * The reference design system done properly, rather than reinterpreted. Warm
 * paper under the whole screen, true white only where the product is
 * operational, one ink at six alphas for every line, and no shadow anywhere
 * because nothing on this screen floats.
 *
 * The one place it overrides the reference is the typeface: Manrope, through
 * `var(--font-sans)`, because the brand is not something the `/madspace`
 * boundary gets to switch.
 *
 * ## The hero
 *
 * Three findings on one surface, divided by two 1px rules, sharing five
 * baselines through a subgrid. They are three independent facts and the
 * composition has to say so without implying a sequence, so there is no
 * connector, no number, no bar across them and nothing that completes.
 *
 * What makes the RELATIONSHIP read is the closing band. Every column ends in
 * the same recessed strip, on the same line, naming what its own state does not
 * tell you: a credential says nothing about whether the machine has run, a
 * heartbeat says nothing about whether events land, a verified event is not a
 * rate. Read across, the band is one continuous statement that none of the
 * three implies another, and it is the reason the dangerous combination,
 * activated and never delivering, is legible here instead of hidden.
 *
 * ## The three buttons
 *
 * Non-functional by instruction. They carry `type="button"`, no handler and no
 * form, so pressing one does nothing at all. They are here because the
 * hierarchy of a real control set is part of what a reviewer is choosing
 * between: one filled, one bordered, one stripped of its border.
 */
export function VariantA({ source, name }: { source: LabSource; name: string }) {
  const f = labFields(source);

  return (
    <div className="dla-root">
      <header className="dla-masthead">
        <div className="dla-gutter dla-masthead-row">
          <span className="dla-masthead-mark">IRIS Observer</span>
          <span className="dla-masthead-where">MADSPACE operations</span>
          <span className="dla-masthead-lab">Design lab, variant A, {name}</span>
        </div>
      </header>

      {/*
       * A div, not a `main`. The MADSPACE layout standing above this route
       * already renders `<main id="main">` around it, and a document with two
       * main landmarks and two elements answering to `#main` is a broken
       * outline whichever of them is right. The stylesheet clears that layout's
       * gutter and chrome so this variant still owns the viewport.
       */}
      <div className="dla-gutter">
        <Head fields={f} tone={source.healthTone} />

        <Findings fields={f} />

        <Record fields={f} />

        <Health fields={f} />
      </div>

      <div className="dla-gutter dla-foot">
        <p>
          Development instrument. One source, read through the same control plane the live screen
          reads, arranged three ways so a direction can be chosen by looking.
        </p>
      </div>
    </div>
  );
}

/* --- the head ------------------------------------------------------------------- */

/** Lifecycle is a decision, not a health reading, and its mark says so. */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

function Head({ fields, tone }: { fields: LabFields; tone: MarkTone }) {
  return (
    <header className="dla-head">
      <div className="dla-head-top">
        <p className="dla-kicker">{fields.kicker}</p>
        <StatusChip tone={tone}>{fields.healthLabel}</StatusChip>
      </div>

      <div className="dla-head-grid">
        <div>
          <h1 className="dla-title">{fields.title}</h1>
          <p className="dla-answer">{fields.answer}</p>
        </div>

        {/*
         * Real hierarchy, no behaviour. The constructive operation is the only
         * filled control on the page; suspension keeps a border because it is
         * reversible and frequent; archival loses its border because it is
         * terminal and rare, and the consequence is written beside it rather
         * than painted on it.
         */}
        <div className="dla-actions">
          <button type="button" className="dla-btn" data-kind="primary">
            Generate reactivation code
          </button>
          <button type="button" className="dla-btn" data-kind="secondary">
            Suspend
          </button>
          <button type="button" className="dla-btn" data-kind="tertiary">
            Archive
          </button>
          <p className="dla-actions-note">
            These reach the installation itself, not this record. Archival is terminal.
          </p>
        </div>
      </div>

      {/*
       * The three words an operator asks for before any figure: whose project,
       * which environment, and whether the source is switched on at all.
       */}
      <dl className="dla-rail">
        <div>
          <dt>Project</dt>
          <dd>{fields.project}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{fields.environment}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>
            <StatusMark tone={LIFECYCLE_TONE[fields.lifecycle] ?? "none"} />
            <span>{fields.lifecycle}</span>
          </dd>
        </div>
      </dl>
    </header>
  );
}

/* --- the hero ------------------------------------------------------------------- */

function Findings({ fields }: { fields: LabFields }) {
  return (
    <section className="dla-section" aria-labelledby="dla-states-heading">
      <div className="dla-section-head">
        <h2 id="dla-states-heading">The three states</h2>
        <p className="dla-section-lede">
          Three separate facts, each read from one persisted column. None of them implies another,
          all of the combinations occur, and the one worth finding is a credential that exists
          beside a machine that has never delivered.
        </p>
      </div>

      <div className="dla-findings">
        {fields.states.map((state) => (
          <article key={state.key} className="dla-finding" data-holds={state.holds}>
            <p className="dla-finding-column">{state.column}</p>

            {/*
             * Shape, colour and a spelled-out word, on one baseline across all
             * three columns. This row is the two-second read.
             */}
            <h3 className="dla-finding-word">
              <StatusMark tone={state.holds ? "good" : "await"} />
              <span>{state.word}</span>
            </h3>

            <p className="dla-finding-evidence">{state.evidence}</p>

            <div className="dla-finding-at">
              <p className="dla-micro">Recorded</p>
              <Value reading={state.at} />
            </div>

            <div className="dla-finding-proves">
              <p className="dla-micro">What it proves</p>
              <p>{state.proves}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* --- a value, and the absence of one ---------------------------------------------- */

/**
 * The honesty rule, in one component.
 *
 * A measurement is a figure: 19px, weight 500, ink, tabular. An absence is a
 * word matched to its field, and it changes size, weight, colour and figure
 * style at once so it cannot be mistaken for one. It also takes the neutral
 * BAR mark, which in this system means no measurement exists and is drawn
 * nothing like a zero.
 *
 * `found` raises a numeral to 700 where an operator is scanning a column for
 * the one figure that is not nothing.
 */
function Value({ reading, found = false }: { reading: Reading; found?: boolean }) {
  if (reading.missing) {
    return (
      <span className="dla-absent">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return (
    <span className="dla-figure" data-weight={found ? "found" : "value"}>
      {reading.text}
    </span>
  );
}

function Field({
  label,
  reading,
  note = null,
}: {
  label: string;
  reading: Reading;
  note?: string | null;
}) {
  return (
    <div className="dla-field">
      <dt>{label}</dt>
      <dd>
        <Value reading={reading} />
        {note === null ? null : <span className="dla-field-note">{note}</span>}
      </dd>
    </div>
  );
}

/* --- the record -------------------------------------------------------------------- */

/**
 * Two provenances, kept apart.
 *
 * The build figures are what the installation last said about itself and are
 * only as current as its last heartbeat. The identifier and the two timestamps
 * are what the control plane holds, and hold whether the machine ever speaks
 * again. Mixing them into one grid of eight would make a reader treat the two
 * halves as equally authoritative, which they are not.
 */
function Record({ fields }: { fields: LabFields }) {
  return (
    <section className="dla-section" aria-labelledby="dla-record-heading">
      <div className="dla-section-head">
        <h2 id="dla-record-heading">The record</h2>
        <p className="dla-section-lede">
          What the installation last said about itself, kept apart from what the control plane holds
          about it. The first is only as current as the last heartbeat; the second stands whether
          the machine speaks again or not.
        </p>
      </div>

      <div className="dla-panel">
        <div className="dla-group">
          <p className="dla-group-title">Reported by the installation</p>
          <dl className="dla-fields">
            {fields.build.map((figure) => (
              <Field key={figure.label} label={figure.label} reading={figure.reading} />
            ))}
          </dl>
        </div>

        <div className="dla-group">
          <p className="dla-group-title">Held by the control plane</p>
          <dl className="dla-fields">
            <div className="dla-field" data-span="2">
              <dt>Source identifier</dt>
              <dd>
                <span className="dla-identifier">{fields.identifier}</span>
              </dd>
            </div>
            <Field label="Created" reading={fields.created} />
            <Field label="Last seen" reading={fields.lastSeen} note={fields.lastSeenAge} />
          </dl>
        </div>
      </div>
    </section>
  );
}

/* --- operational health -------------------------------------------------------------- */

function Health({ fields }: { fields: LabFields }) {
  return (
    <section className="dla-section" aria-labelledby="dla-health-heading">
      <div className="dla-section-head">
        <h2 id="dla-health-heading">Operational health</h2>
        <p className="dla-section-lede">
          Every field below is optional in a heartbeat: a plugin that cannot measure its outbox must
          still be able to say it is alive. So a figure that was not measured says so, and never
          reads as zero. An empty quarantine and an unmeasured one are different facts.
        </p>
      </div>

      <div className="dla-panel">
        <div className="dla-outbox">
          <p className="dla-group-title">The outbox</p>
          <dl className="dla-fields" data-shape="outbox">
            <Field label="Held" reading={fields.queueUsed} />
            <Field label="Ceiling" reading={fields.queueCeiling} />
            <Field label="Fill" reading={fields.fillReading} />
          </dl>

          {/*
           * The bar is a proportion of a real limit, so it is drawn only when
           * there is a proportion to draw. A track at zero standing in for an
           * unmeasured queue is the exact lie the fill READING above already
           * refuses to tell.
           */}
          {fields.fill === null ? null : (
            <>
              <div className="dla-track" aria-hidden="true">
                <div className="dla-track-fill" style={{ inlineSize: `${fields.fill}%` }} />
              </div>
              <div className="dla-scale" aria-hidden="true">
                <span>0</span>
                <span>
                  {fields.queueCeiling.missing ? "Ceiling not reported" : fields.queueCeiling.text}
                </span>
              </div>
            </>
          )}
        </div>

        <dl className="dla-readings">
          {fields.health.map((figure) => (
            <div key={figure.label} className="dla-reading">
              <dt>{figure.label}</dt>
              <dd className="dla-reading-note">{figure.note}</dd>
              <dd className="dla-reading-value">
                <Value reading={figure.reading} found />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
