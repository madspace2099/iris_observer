import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";

import type { LabScreenProps, LabSource } from "../../lab-data";
import { labFields, type LabFigure, type LabState } from "../../lab-fields";

/**
 * VARIANT C. HYBRID EXECUTIVE.
 *
 * A graphite frame around a paper workspace, and the question this direction
 * has to answer is whether Observer could carry a dark premium chrome while
 * every fact an operator reads all day sits on paper.
 *
 * ## The boundary is a rule about content, not a change of taste
 *
 * Graphite holds what we CONCLUDE and what a person may DO: the source
 * identity, its scope, the one-sentence answer, the one-word health verdict and
 * the three lifecycle controls. Paper holds what was MEASURED: the three
 * readings, the outbox, the counts, the versions, the dates.
 *
 * So the seam is legible without a caption. Above it, the sentence. Below it,
 * the evidence for the sentence. An operator who wants to know why the answer
 * says what it says looks down, and the ground changing is the instruction.
 *
 * ## Why it is one design rather than two pasted together
 *
 * Three things hold it together, and they are all structural.
 *
 * **One token set, declared twice.** The design system already specifies its
 * inverse theme as a token swap on a class. `design-lab-c.css` performs that
 * swap by REGION instead of by page: `.dlc-graphite` carries the section 8
 * values, `.dlc-paper` the section 2 values, under the same names. Nothing here
 * needs a dark variant of `StatusChip`, because the chip reads
 * `--state-good-tint` and both grounds define it.
 *
 * **One left edge.** The plate is held off the frame by `--dlc-inset` and pads
 * itself by `--dlc-pad`; the masthead pads by the sum. Graphite copy and paper
 * copy therefore stand on the same vertical, and the scope band shares its
 * outer edge with the plate. Nothing steps in or out where the ground changes.
 *
 * **The frame wraps rather than caps.** A dark strip across the top would be a
 * header, and a header does not need a reason to be dark. This one runs down
 * both sides of the plate and closes underneath it, so the paper reads as a
 * plate seated in a mount, which is a relationship rather than a decoration.
 *
 * ## The hero
 *
 * Three bays in one panel, divided by the system's 1px line, equal in width,
 * equal in structure, and anchored on the same four horizontals: the column, a
 * word at heading size with its mark, the evidence, and the ceiling. Each carries
 * `proves`, which is where that reading STOPS, and the three ceilings sit at
 * one height so a reader sees three separate stopping points rather than a
 * chain. There is no arrow between the bays, no number on them, no bar across
 * them and no percentage over them, because none of those would be true: the
 * three are independent, and the combination the product exists to expose is
 * activated and never delivering.
 *
 * ## The controls do nothing
 *
 * Suspend, Archive and Generate reactivation code are `type="button"` with no
 * handler and no action import. They carry a real hierarchy, because the
 * hierarchy is part of what is being reviewed: one filled control, one bordered
 * one, and the destructive treatment spent only on the operation that has no
 * inverse. The line beneath them says on the screen that they are inert.
 */

/** A `Reading` as the lab hands it over: the text, and whether it is a measurement. */
type LabReading = LabFigure["reading"];

/**
 * Lifecycle is a decision rather than a health reading, and its marks say so.
 *
 * Keyed on the word `lifecycleWord` produces, because that word is all the lab
 * hands over. A state this table does not know falls to the neutral bar rather
 * than to a guess.
 */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

/**
 * A value, or the word that stands where a value is not.
 *
 * The whole honesty of the screen sits in this branch. A reading that was never
 * measured drops a size, drops to regular weight, drops to the metadata ink and
 * takes the bar mark in front of it, so it cannot be mistaken for a figure at a
 * glance or in greyscale. `missing` is never ignored and never becomes a dash.
 */
function Value({ reading }: { reading: LabReading }) {
  if (!reading.missing) return <span className="dlc-value">{reading.text}</span>;

  return (
    <span className="dlc-value" data-missing="true">
      <StatusMark tone="none" />
      <span>{reading.text}</span>
    </span>
  );
}

/** One labelled cell of a data panel. The label reserves two lines in CSS. */
function Cell({ label, reading }: { label: string; reading: LabReading }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Value reading={reading} />
      </dd>
    </div>
  );
}

/**
 * One of the three readings.
 *
 * `holds` decides the mark and the tint, and it decides nothing else: the word
 * comes from the lab already written, and a reading that does not hold is drawn
 * as the hollow ring rather than the triangle, because waiting on an
 * installation is not a fault.
 */
function Bay({ state }: { state: LabState }) {
  const tone: MarkTone = state.holds ? "good" : "await";

  return (
    <article className="dlc-bay" data-holds={state.holds}>
      <p className="dlc-bay-column">{state.column}</p>
      <h3 className="dlc-bay-word">
        <StatusMark tone={tone} />
        <span>{state.word}</span>
      </h3>
      <p className="dlc-bay-evidence">{state.evidence}</p>
      <div className="dlc-bay-when">
        <p className="dlc-micro">When</p>
        <Value reading={state.at} />
      </div>
      <div className="dlc-bay-proves">
        <p className="dlc-micro">What this proves</p>
        <p>{state.proves}</p>
      </div>
    </article>
  );
}

export function SourceDetailC({ estate, variantName }: LabScreenProps) {
  /*
   * The estate arrives whole and this screen takes the source from it. Every
   * screen in the lab receives the same single prop, so no two can be handed
   * different readings of the same moment.
   */
  const source: LabSource = estate.source;
  const name = variantName;

  const f = labFields(source);

  return (
    <div className="dlc-root dlc-graphite">
      <a className="dlc-skip" href="#dlc-work">
        Skip to the readings
      </a>

      <div className="dlc-frame">
        {/*
         * The frame carries the product identity, which is the only navigation
         * the lab can honestly show: there is nowhere for a link on this route
         * to go, and a breadcrumb that leads nowhere is furniture pretending to
         * be a way out. The variant names itself here, quietly, so a screenshot
         * of the composition is identifiable without a badge in the layout.
         */}
        <div className="dlc-rail">
          <p className="dlc-rail-mark">
            IRIS Observer <span>MADSPACE operations</span>
          </p>
          <p className="dlc-rail-lab">Design lab &middot; Variant C &middot; {name}</p>
        </div>

        <header>
          <div className="dlc-mast-grid">
            <div className="dlc-mast-text">
              <p className="dlc-kicker">{f.kicker}</p>
              <h1 className="dlc-title">{f.title}</h1>
              <p className="dlc-answer">{f.answer}</p>
              <div className="dlc-verdict">
                <StatusChip tone={source.healthTone}>{f.healthLabel}</StatusChip>
                <span className="dlc-verdict-note">
                  One word for the whole source, by strict precedence. The three readings below are
                  what it summarises.
                </span>
              </div>
            </div>

            {/*
             * NON FUNCTIONAL, DELIBERATELY. Every one is `type="button"` with no
             * handler and nothing imported from `source-actions`. What is being
             * reviewed is the hierarchy: one filled control, one bordered, and
             * the destructive treatment spent only on the operation with no
             * inverse.
             */}
            <div className="dlc-controls">
              <p className="dlc-controls-label">Source controls</p>
              <div className="dlc-controls-row">
                <button type="button" className="dlc-btn" data-kind="primary">
                  Generate reactivation code
                </button>
                <button type="button" className="dlc-btn" data-kind="secondary">
                  Suspend
                </button>
                <button type="button" className="dlc-btn" data-kind="destructive">
                  Archive
                </button>
              </div>
              <p className="dlc-controls-note">
                Inert in the design lab. None of the three is wired to an action.
              </p>
            </div>
          </div>

          {/*
           * The scope band: whose estate, which environment, whether the source
           * is switched on at all, and the identifier. It is the last graphite
           * element, it shares the plate's outer edge, and it is what the paper
           * is seated against.
           */}
          <dl className="dlc-scope">
            <div>
              <dt>Project</dt>
              <dd>
                <span className="dlc-value">{f.project}</span>
              </dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>
                <span className="dlc-value">{f.environment}</span>
              </dd>
            </div>
            <div>
              <dt>Lifecycle</dt>
              <dd>
                <span className="dlc-value dlc-inline">
                  <StatusMark tone={LIFECYCLE_TONE[f.lifecycle] ?? "none"} />
                  <span>{f.lifecycle}</span>
                </span>
              </dd>
            </div>
            <div>
              <dt>Source identifier</dt>
              <dd>
                <span className="dlc-id">{f.identifier}</span>
              </dd>
            </div>
          </dl>
        </header>

        {/*
         * A div rather than a `main`. The lab route nests inside the MADSPACE
         * shell, which already emits the `main` landmark, and a second one
         * inside it would leave a screen reader with two documents to choose
         * between. The skip link still lands here, which is what it is for.
         */}
        <div id="dlc-work" className="dlc-plate dlc-paper">
          {/* --- the hero ------------------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-readings">
            <div className="dlc-region-head">
              <h2 id="dlc-readings">The three readings</h2>
              <p className="dlc-lede">
                Configured, reachable, delivering. Three independent facts, each proved by its own
                record, and none of them implies another. Every combination of the three occurs, so
                each reading states below it where its proof stops.
              </p>
            </div>
            <div className="dlc-bays">
              {f.states.map((state) => (
                <Bay key={state.key} state={state} />
              ))}
            </div>
          </section>

          {/* --- delivery and holding ------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-delivery">
            <div className="dlc-region-head">
              <h2 id="dlc-delivery">Delivery and holding</h2>
              <p className="dlc-lede">
                What the outbox is holding, and what was refused on the way in. Every field here is
                optional in a heartbeat, so a figure that was not measured reads as a word and never
                as a zero.
              </p>
              {/*
               * Definitions only. The design system permits the reason a figure
               * is shaped the way it is behind a disclosure, and forbids the
               * state, the date or the refusal from going there. The seven
               * values are all on the surface; only what each one counts is
               * behind this control.
               */}
              <details className="dlc-note">
                <summary>What each figure counts</summary>
                <dl className="dlc-note-body">
                  {f.health.map((figure) => (
                    <div key={figure.label}>
                      <dt>{figure.label}</dt>
                      <dd>{figure.note}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </div>

            <div className="dlc-outbox">
              <div className="dlc-outbox-figures">
                <div>
                  <p className="dlc-micro">Outbox fill</p>
                  {f.fillReading.missing ? (
                    <Value reading={f.fillReading} />
                  ) : (
                    <p className="dlc-fill">{f.fillReading.text}</p>
                  )}
                </div>
                <dl className="dlc-pair">
                  <div>
                    <dt>Held</dt>
                    <dd>
                      <Value reading={f.queueUsed} />
                    </dd>
                  </div>
                  <div>
                    <dt>Ceiling</dt>
                    <dd>
                      <Value reading={f.queueCeiling} />
                    </dd>
                  </div>
                </dl>
              </div>
              {/*
               * Drawn only where the proportion exists. A track at zero
               * standing in for an unmeasured outbox is the exact lie the
               * missing treatment exists to prevent, so when the fill is
               * absent there is no track at all, only the word above it.
               */}
              {f.fill === null ? null : (
                <div className="dlc-track" aria-hidden="true">
                  <div className="dlc-track-fill" style={{ width: `${f.fill}%` }} />
                </div>
              )}
            </div>

            <dl className="dlc-panel" data-span-last="true">
              {f.health.map((figure) => (
                <Cell key={figure.label} label={figure.label} reading={figure.reading} />
              ))}
            </dl>
          </section>

          {/* --- installation and record ---------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-installation">
            <div className="dlc-region-head">
              <h2 id="dlc-installation">Installation and record</h2>
              <p className="dlc-lede">
                What the machine says it is running, and what the control plane holds about it. Two
                different authorities, so they are two panels rather than one.
              </p>
            </div>

            <h3 className="dlc-subhead">As last reported by the installation</h3>
            <dl className="dlc-panel">
              {f.build.map((figure) => (
                <Cell key={figure.label} label={figure.label} reading={figure.reading} />
              ))}
            </dl>

            <h3 className="dlc-subhead">As held in the record</h3>
            <dl className="dlc-panel" data-cols="2">
              <Cell label="Created" reading={f.created} />
              <div>
                <dt>Last seen</dt>
                <dd>
                  <Value reading={f.lastSeen} />
                  {f.lastSeenAge === null ? null : <span className="dlc-age">{f.lastSeenAge}</span>}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <footer className="dlc-foot">
          <p>Development instrument. Nothing on this route writes to the control plane.</p>
        </footer>
      </div>
    </div>
  );
}
