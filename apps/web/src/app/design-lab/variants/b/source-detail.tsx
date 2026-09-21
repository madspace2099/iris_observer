import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";
import type { Reading } from "@/lib/madspace/format";

import type { LabScreenProps, LabSource } from "../../lab-data";
import { labFields, type LabFigure, type LabState } from "../../lab-fields";

/**
 * VARIANT B. GRAPHITE CONSOLE.
 *
 * A dark operating surface for the Source detail screen: deep graphite ground,
 * two elevated dark surfaces, one lightened status palette and IRIS blue kept
 * for the focus ring and the operator state, which are the only two places on
 * this screen where blue means something.
 *
 * It holds the measurements of the client-portal system rather than inverting
 * them: 12px radius, the 1/8/12/20/28 rhythm, 40/24/16 gutters, a 1440px cap,
 * no shadow anywhere, and nothing under 12px. What is redrawn is the status
 * palette, because the greens and ambers chosen for warm paper fall to roughly
 * 1.5:1 on #12181F and a status colour that cannot be read is a defect rather
 * than a style.
 *
 * ## The hero is a matrix, not three cards
 *
 * The three states are three answers to three different questions, and the
 * composition has to say so before any word is read. So they are laid out as a
 * ledger: a left rail names the aspect being asked, three equal columns answer
 * it, and the reading works horizontally as well as vertically. Nothing spans
 * two columns, nothing points from one to the next, no bar crosses them and no
 * percentage sits over them, because each of those would assert an ordering
 * that does not exist. The last row is the part a stepper would deny outright:
 * each column states, in its own words, what it does NOT prove.
 *
 * The verdict and the answer sentence sit in a band above the matrix, on the
 * same two-column geometry, so the vertical rule runs unbroken from the chip
 * down the rail. The sentence is the answer and the columns are the facts it is
 * made of; neither is derived from the other, and the badge and the sentence
 * come from the same deterministic branch upstream so they cannot disagree.
 *
 * ## The actions do nothing
 *
 * Suspend, Archive and Generate reactivation code are rendered as real controls
 * with a real hierarchy, and every one of them is inert: `type="button"` and no
 * handler, on a server component that could not carry one. The lab is choosing
 * a composition, not wiring an operation, and the screen says so under them.
 */

/** What each column actually answers. The brief's three questions, verbatim. */
const QUESTION: Readonly<Record<LabState["key"], string>> = {
  activation: "Is this source configured?",
  connection: "Is it online?",
  ingestion: "Is valid analytics reaching Observer?",
};

/** Which instant the column's date is. The rail says "Observed at"; this says which. */
const OBSERVED: Readonly<Record<LabState["key"], string>> = {
  activation: "Credential issued",
  connection: "Last heartbeat",
  ingestion: "Ingestion proved",
};

/**
 * Lifecycle is a decision rather than a health reading, and its marks say so:
 * a person set it and a person can unset it. The mapping agrees with the one
 * the real screen uses, because one source wearing two shapes on two screens is
 * the drift the single mark function exists to prevent.
 */
const LIFECYCLE_TONE: Readonly<Record<string, MarkTone>> = {
  Active: "good",
  Suspended: "operator",
  Archived: "settled",
};

/**
 * A state holds, or we are waiting on the installation. Never a third thing.
 *
 * Not activated, awaiting a first heartbeat, offline and not verified are all
 * the ring: nothing is refusing and nobody has failed, we are waiting. The
 * triangle is reserved for the health verdict, which is the only reading on
 * this screen that knows about refusals.
 */
function stateTone(state: LabState): MarkTone {
  return state.holds ? "good" : "await";
}

/**
 * A measurement, or the fact that there is none.
 *
 * The two do not share a treatment. An absent value drops the value size, the
 * medium weight and the tabular figures, and it carries the neutral bar, which
 * this system draws for "no measurement exists" and never for a zero.
 */
function Value({ reading, weight }: { reading: Reading; weight?: "figure" }) {
  if (reading.missing) {
    return (
      <span className="dlb-absent">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return <span className={weight === "figure" ? "dlb-figure" : "dlb-value"}>{reading.text}</span>;
}

/** One ledger cell: a two-line label reserve, the value, and what it counts. */
function Cell({ figure, wide = false }: { figure: LabFigure; wide?: boolean }) {
  return (
    <div className={wide ? "dlb-cell dlb-span2" : "dlb-cell"}>
      <p className="dlb-cell-label">{figure.label}</p>
      <p className="dlb-cell-value">
        <Value reading={figure.reading} />
      </p>
      {figure.note === "" ? null : <p className="dlb-cell-note">{figure.note}</p>}
    </div>
  );
}

/** One column of the matrix. Five rows, aligned by subgrid to the other two. */
function StateColumn({ state }: { state: LabState }) {
  const tone = stateTone(state);

  return (
    <div className="dlb-col">
      <div className="dlb-cellpad dlb-r-head">
        <p className="dlb-eyebrow">{state.column}</p>
        <h3 className="dlb-question">{QUESTION[state.key]}</h3>
      </div>

      <div className="dlb-cellpad dlb-r-state">
        <span className="dlb-rowlabel">State</span>
        <p className="dlb-word" data-tone={tone}>
          <span className="dlb-plate" data-tone={tone}>
            <StatusMark tone={tone} />
          </span>
          <span>{state.word}</span>
        </p>
      </div>

      <div className="dlb-cellpad dlb-r-evidence">
        <span className="dlb-rowlabel">Evidence</span>
        <p className="dlb-evidence">{state.evidence}</p>
      </div>

      <div className="dlb-cellpad dlb-r-observed">
        <p className="dlb-fieldname">{OBSERVED[state.key]}</p>
        <p className="dlb-observed">
          <Value reading={state.at} />
        </p>
      </div>

      <div className="dlb-cellpad dlb-r-proves">
        <span className="dlb-rowlabel">What it proves</span>
        <p className="dlb-proves">{state.proves}</p>
      </div>
    </div>
  );
}

/**
 * The left rail of the matrix. Decorative in the accessibility tree only: every
 * label it shows also travels inside the cell it labels, visually hidden while
 * the rail is on screen, so a screen reader hears the pair rather than a
 * detached column of headings.
 */
function Spine() {
  return (
    <div className="dlb-spinecol" aria-hidden="true">
      <div className="dlb-cellpad dlb-r-head">
        <p className="dlb-spinelabel">The question</p>
      </div>
      <div className="dlb-cellpad dlb-r-state">
        <p className="dlb-spinelabel">State</p>
      </div>
      <div className="dlb-cellpad dlb-r-evidence">
        <p className="dlb-spinelabel">Evidence</p>
      </div>
      <div className="dlb-cellpad dlb-r-observed">
        <p className="dlb-spinelabel">Observed at</p>
      </div>
      <div className="dlb-cellpad dlb-r-proves">
        <p className="dlb-spinelabel">What it proves</p>
      </div>
    </div>
  );
}

export function SourceDetailB({ estate, variantName }: LabScreenProps) {
  /*
   * The estate arrives whole and this screen takes the source from it. Every
   * screen in the lab receives the same single prop, so no two can be handed
   * different readings of the same moment.
   */
  const source: LabSource = estate.source;
  const name = variantName;

  const f = labFields(source);

  /*
   * The outbox is the one ratio on this screen with a real denominator, and the
   * denominator is printed beside it in its own cell. When the fill could not
   * be computed there is no track at all: an empty meter would draw a measured
   * zero for a figure that was never measured.
   */
  const fill = f.fill === null ? null : Math.min(100, Math.max(0, f.fill));

  const capacity: readonly LabFigure[] = [
    { label: "Queue used", reading: f.queueUsed, note: "Bytes the outbox is holding." },
    { label: "Queue ceiling", reading: f.queueCeiling, note: "Configured in the plugin." },
  ];

  const record: readonly LabFigure[] = [
    { label: "Created", reading: f.created, note: "" },
    {
      label: "Last seen",
      reading: f.lastSeen,
      note: f.lastSeenAge ?? "",
    },
  ];

  const lastHealth = f.health.length - 1;

  return (
    <div className="dlb-root">
      <header className="dlb-rail">
        <div className="dlb-width dlb-rail-inner">
          <p className="dlb-rail-name">
            MADSPACE Operations <span>Source detail</span>
          </p>
          <p className="dlb-rail-tag">Design lab / Variant B / {name}</p>
        </div>
      </header>

      {/*
       * A div rather than a landmark. The lab layout carries no chrome, but the
       * MADSPACE shell above it already renders a main with this id, and a
       * nested main plus a duplicate id is a defect rather than a composition.
       */}
      <div className="dlb-width">
        {/* --- the masthead: what this is, and what can be done to it --- */}
        <div className="dlb-masthead">
          <div>
            <p className="dlb-eyebrow">{f.kicker}</p>
            <h1 className="dlb-title">{f.title}</h1>
            <div className="dlb-meta">
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Project</span>
                <span className="dlb-meta-value">{f.project}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Environment</span>
                <span className="dlb-meta-value">{f.environment}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Lifecycle</span>
                <StatusChip tone={LIFECYCLE_TONE[f.lifecycle] ?? "none"}>{f.lifecycle}</StatusChip>
              </span>
            </div>
          </div>

          <div>
            <div className="dlb-actions">
              {/*
               * One filled control, one bordered, one text. Archive is the only
               * operation here with no inverse, so it takes the destructive
               * treatment; painting Suspend red as well would teach an operator
               * that red is routine, which is the training that makes the
               * terminal one dangerous.
               *
               * All three are inert. `type="button"` and no handler.
               */}
              <button className="dlb-btn" data-kind="primary" type="button">
                Generate reactivation code
              </button>
              <button className="dlb-btn" data-kind="secondary" type="button">
                Suspend
              </button>
              <button className="dlb-btn" data-kind="destructive" type="button">
                Archive
              </button>
            </div>
            <p className="dlb-inert">Controls inert in the design lab</p>
          </div>
        </div>

        {/* --- the hero --- */}
        <section className="dlb-section" aria-labelledby="dlb-states-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-states-heading">
              The three states
            </h2>
            <p className="dlb-sectionnote">
              Three independent facts. None of them implies another.
            </p>
          </div>

          <div className="dlb-hero">
            <div className="dlb-answerband">
              <div className="dlb-answerband-rail">
                <p className="dlb-spinelabel">Verdict</p>
                <StatusChip tone={source.healthTone}>{f.healthLabel}</StatusChip>
              </div>
              <div className="dlb-answerband-body">
                <p className="dlb-answer">{f.answer}</p>
              </div>
            </div>

            <div className="dlb-matrix">
              <Spine />
              {f.states.map((state) => (
                <StateColumn key={state.key} state={state} />
              ))}
            </div>
          </div>
        </section>

        {/* --- delivery: what the installation holds and what it refused --- */}
        <section className="dlb-section" aria-labelledby="dlb-delivery-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-delivery-heading">
              Delivery
            </h2>
            <p className="dlb-sectionnote">
              Counted by the installation and reported on its heartbeat.
            </p>
          </div>

          <div className="dlb-ledger">
            <div className="dlb-cell dlb-span2">
              <p className="dlb-cell-label">Outbox fill</p>
              <p className="dlb-cell-value">
                <Value reading={f.fillReading} weight="figure" />
              </p>
              {fill === null ? null : (
                <div className="dlb-meter" aria-hidden="true">
                  <div className="dlb-meter-fill" style={{ inlineSize: `${fill}%` }} />
                </div>
              )}
              <p className="dlb-cell-note">
                Bytes held against the ceiling configured in the plugin.
              </p>
            </div>

            {capacity.map((figure) => (
              <Cell key={figure.label} figure={figure} />
            ))}

            {f.health.map((figure, index) => (
              <Cell key={figure.label} figure={figure} wide={index === lastHealth} />
            ))}
          </div>
        </section>

        {/* --- what the installation is, and what the record says --- */}
        <section className="dlb-section" aria-labelledby="dlb-build-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-build-heading">
              Installation and record
            </h2>
            <p className="dlb-sectionnote">
              The build is what the machine last reported. The record is ours.
            </p>
          </div>

          <div className="dlb-ledger">
            {f.build.map((figure) => (
              <Cell key={figure.label} figure={figure} />
            ))}

            <div className="dlb-cell dlb-span2">
              <p className="dlb-cell-label">Source identifier</p>
              <p className="dlb-cell-value">
                <span className="dlb-value">{f.identifier}</span>
              </p>
              <p className="dlb-cell-note">Issued by the control plane. It never changes.</p>
            </div>

            {record.map((figure) => (
              <Cell key={figure.label} figure={figure} />
            ))}
          </div>
        </section>
      </div>

      <footer className="dlb-foot">
        <div className="dlb-width dlb-foot-inner">
          <span>Design lab / Source detail / Variant B</span>
          <span>{name}</span>
        </div>
      </footer>
    </div>
  );
}
