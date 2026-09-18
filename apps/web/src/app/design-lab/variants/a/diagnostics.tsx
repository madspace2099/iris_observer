import type { ReactNode } from "react";

import type { LabDiagnostics, LabScreenProps } from "../../lab-data";
import { RECENT_LIMIT, type DiagnosticSource } from "@/lib/madspace/diagnostics";
import { HEALTH_LABEL, HEALTH_TONE } from "@/lib/sources/control-plane";
import {
  ageSince,
  bytes,
  count,
  environmentWord,
  instant,
  percent,
  reported,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";
import { StatusChip, StatusMark, type MarkTone } from "@/components/madspace/StatusMark";

/**
 * VARIANT A, THE ESTATE ON A BAD DAY. CANONICAL LIGHT, ON PAPER.
 *
 * The fifth screen of the same direction, and deliberately the same parts as
 * the four before it: one masthead, one gutter, a head whose second line is the
 * answer, the colophon rail, the section head at 18rem/1fr, and bordered panels
 * divided by hairlines. What changes is what the panels hold.
 *
 * ## What the screen is for
 *
 * One question, asked when something has broken: **does anybody have work to
 * do?** So the head answers it in a sentence, the rail counts it against the
 * estate, and the first section is that answer at full size. Everything below
 * is corroboration.
 *
 * ## Why the corroboration is ONE panel and not five
 *
 * Almost every installation in this account has never been activated, so one
 * source supplies every row on the screen and the corroborating sections hold
 * one row or none. Five bordered panels each containing a single row, or a
 * single sentence explaining why there is no row, is the scrapbook every
 * operations screen drifts into: five containers, almost no figures, and a page
 * that looks broken because the estate is quiet rather than because anything is
 * wrong.
 *
 * One panel divided by hairlines holds that honestly. It is the Record grammar
 * from Source detail at five bands instead of two, every band names what it
 * lists, and a band with nothing in it says WHY it has nothing rather than
 * showing an empty table.
 *
 * ## Nothing here is a rate
 *
 * No sparkline, no gauge, no ring, no series. The control plane persists the
 * CURRENT operational state per source, so a trend drawn here would be drawn
 * from numbers that do not exist. Every figure below is one persisted column
 * read once for the whole account.
 *
 * ## Zero and unmeasured are drawn differently, everywhere
 *
 * A band empty because nothing has happened yet takes the ring, which in this
 * system means nothing is wrong and we are waiting on the installation. A band
 * empty because nothing was ever measured takes the neutral bar, which means no
 * measurement exists and is drawn nothing like a zero. The two are never the
 * same shape, the same colour or the same word.
 */
export function DiagnosticsA({ estate, screenName, variantName }: LabScreenProps) {
  const diagnostics = estate.diagnostics;

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
       * A div, not a `main`, for the reason the four screens before it state:
       * the route above owns the document outline.
       */}
      <div className="dla-gutter">
        <header className="dla-head">
          <div className="dla-head-top">
            <p className="dla-kicker">Operations</p>
          </div>

          <div className="dla-head-grid">
            <div>
              <h1 className="dla-title">Diagnostics</h1>
              <p className="dla-answer">{answer(diagnostics, estate.accountName)}</p>
            </div>

            {/*
             * The narrowing, drawn and inert, in the slot the other four
             * screens give to the page's one control. It keeps the border
             * rather than the fill: the filled treatment belongs to a
             * constructive operation, and narrowing a view creates nothing.
             */}
            <div className="dla-actions">
              <button type="button" className="dla-btn" data-kind="secondary">
                Narrow this view
              </button>
              <p className="dla-actions-note">
                In the product this narrows by project, by environment and by verdict, and the
                narrowing lives in the address so a filtered view is a link. It is inert here, and
                nothing below is filtered.
              </p>
            </div>
          </div>

          {/*
           * Four cells: whose estate, which database, how large, and how much
           * of it needs somebody. The last is a share of the third, because two
           * requiring attention is not a fact and two of seven is.
           */}
          <dl className="dla-rail" data-cells="4">
            <div>
              <dt>Account</dt>
              <dd>{estate.accountName}</dd>
            </div>
            <div>
              <dt>Control plane</dt>
              <dd>{estate.local ? "Local development database" : "Hosted database"}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>
                <Value reading={count(diagnostics.total)} found />
              </dd>
            </div>
            <div>
              <dt>Requiring an operator</dt>
              <dd>
                <Value reading={count(diagnostics.attention.length)} found />
                <span className="dla-tally-of">of {count(diagnostics.total).text}</span>
              </dd>
            </div>
          </dl>
        </header>

        <Attention diagnostics={diagnostics} now={estate.now} />

        <Record diagnostics={diagnostics} now={estate.now} />
      </div>

      <div className="dla-gutter dla-foot">
        <p>
          Development instrument. Every installation in the account, read once through the same
          control plane the live screen reads. Each figure is a state persisted for a source: not a
          rate, not a trend, and never an analytic.
        </p>
      </div>
    </div>
  );
}

/* --- the sentence in the second line -------------------------------------------------- */

/**
 * Plurals through `Intl`, with the locale pinned, exactly as the estate list
 * pins it. Every NUMERAL still comes from `count()`; this decides a noun.
 */
const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/**
 * The whole screen in one sentence, and it names a source rather than a score.
 *
 * The commonest reading of this page ends after this line, and a count does not
 * tell anybody where to go. So the sentence states the scale, then whether
 * anybody has work to do, then which installation is worst. Its verdict word
 * comes from the shared table, so the sentence and the chip beside the first
 * section cannot disagree.
 */
function answer(diagnostics: LabDiagnostics, account: string): string {
  if (diagnostics.total === 0) {
    return `${account} holds no sources, so there is nothing to diagnose.`;
  }

  const scale =
    `${count(diagnostics.total).text} ${plural(diagnostics.total, "source", "sources")} ` +
    "across every project and every environment in this account.";

  const worst = diagnostics.attention[0];
  if (worst === undefined) {
    return `${scale} None of them is offline, refusing events or suspended, so nobody has work to do on this screen right now.`;
  }

  const verdict = HEALTH_LABEL[worst.health].toLowerCase();
  return (
    `${scale} ${count(diagnostics.attention.length).text} ` +
    `${plural(diagnostics.attention.length, "requires", "require")} an operator, worst first, ` +
    `and ${worst.row.display_label} is ${verdict}.`
  );
}

/* --- a value, and the absence of one --------------------------------------------------- */

/**
 * Identical to the four screens before it. A measurement is a figure: 19px,
 * weight 500, ink, tabular. An absence is a word matched to the field, and it
 * changes size, weight, colour and figure style at once so it cannot be
 * mistaken for one. It takes the neutral BAR mark, which in this system means
 * no measurement exists and is drawn nothing like a zero.
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

/* --- section one: does anybody have work to do ----------------------------------------- */

function Attention({ diagnostics, now }: { diagnostics: LabDiagnostics; now: Date }) {
  const alerts = diagnostics.attention;

  return (
    <section className="dla-section" aria-labelledby="dla-attention-heading">
      <div className="dla-section-head">
        {/*
         * The verdict sits under the heading rather than at the far end of the
         * screen, for the reason the head states: a chip a thousand pixels away
         * from the words it qualifies is not leading with anything.
         */}
        <div className="dla-section-id">
          <h2 id="dla-attention-heading">Does anybody have work to do?</h2>
          {alerts.length === 0 ? (
            <StatusChip tone="good">No operator needed</StatusChip>
          ) : (
            <StatusChip tone="wrong">Needs an operator</StatusChip>
          )}
        </div>
        <p className="dla-section-lede">
          Offline, refusing events, or switched off deliberately. Worst first, then production
          before staging, then whichever has been silent longest. A source waiting for its first
          heartbeat is not here, because a machine nobody has reached yet has not failed at
          anything.
        </p>
      </div>

      {alerts.length === 0 ? (
        <Result diagnostics={diagnostics} />
      ) : (
        <div className="dla-panel" data-shape="rows">
          {alerts.map((source) => (
            <Alert key={source.row.source_id} source={source} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * An empty attention list is a RESULT, and it is drawn like one.
 *
 * Not a thin grey line and not a missing panel. It takes the same surface a
 * populated list takes, the same mark and word treatment the hero on Source
 * detail gives to a state, and it carries the two counts that qualify it: an
 * estate where nothing needs an operator because six machines have never been
 * switched on is a different estate from one where nothing needs an operator
 * because everything is delivering.
 */
function Result({ diagnostics }: { diagnostics: LabDiagnostics }) {
  const silent = absentFrom(diagnostics.total, diagnostics.heartbeats.length);
  const unproved = absentFrom(diagnostics.total, diagnostics.verifications.length);

  return (
    <div className="dla-panel">
      <div className="dla-result">
        <p className="dla-micro">The answer</p>
        <h3 className="dla-result-word">
          <StatusMark tone="good" />
          <span>Nobody has work to do</span>
        </h3>
        <p className="dla-result-note">
          No source in this account is offline, holding refused events or suspended. That is a
          statement about faults and not about delivery: the two counts beside it are what say how
          much of the estate has ever spoken at all.
        </p>

        {silent === null || unproved === null ? (
          <p className="dla-result-note">
            The lists below are capped at {count(RECENT_LIMIT).text}, so this section cannot say how
            many sources are missing from them.
          </p>
        ) : (
          <dl className="dla-tally" data-cells="2">
            <div>
              <dt className="dla-micro">Never heard from</dt>
              <dd>
                <Value reading={count(silent)} found />
                <span className="dla-tally-of">of {count(diagnostics.total).text}</span>
              </dd>
            </div>
            <div>
              <dt className="dla-micro">Never verified</dt>
              <dd>
                <Value reading={count(unproved)} found />
                <span className="dla-tally-of">of {count(diagnostics.total).text}</span>
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

/**
 * How many sources are missing from a recency list, or null when it cannot be
 * known.
 *
 * The recency lists are sliced to {@link RECENT_LIMIT}, so subtracting a full
 * list from the estate would report every source past the eighth as one that
 * has never been heard from. A list shorter than the cap is complete and the
 * subtraction is sound; a list at the cap may be truncated, and null is how
 * this screen says so instead of printing a confident wrong number.
 */
function absentFrom(total: number, listed: number): number | null {
  return listed < RECENT_LIMIT ? total - listed : null;
}

/**
 * One installation that needs somebody, as a row.
 *
 * The same row grammar as the estate and the project lists: identity at the
 * left, the fact in the middle, the instants at the right. The verdict word and
 * its mark come from the one shared table, and the REASON beside it is composed
 * from the same columns that produced the verdict, so the word and the sentence
 * cannot disagree.
 */
function Alert({ source, now }: { source: DiagnosticSource; now: Date }) {
  const { row } = source;
  const last = instant(row.last_heartbeat_at);
  const age = ageSince(row.last_heartbeat_at, now);

  return (
    <article className="dla-row" data-shape="alert">
      <div className="dla-row-id">
        <p className="dla-micro">{sourceTypeWord(row.source_type)}</p>
        <h3 className="dla-row-name">{row.display_label}</h3>
        <div className="dla-row-line">
          <span className="dla-row-where">{source.projectName ?? "Project not named"}</span>
          <span className="dla-row-where">{environmentWord(row.environment)}</span>
          <StatusChip tone={HEALTH_TONE[source.health]}>{HEALTH_LABEL[source.health]}</StatusChip>
          {row.environment_mismatch ? (
            <StatusChip tone="wrong">Environment mismatch</StatusChip>
          ) : null}
        </div>
      </div>

      {/* The word above says WHAT. This says WHY, in words and never in a colour. */}
      <p className="dla-alert-reason">
        {source.reason ?? "No reason was recorded for this verdict."}
      </p>

      <dl className="dla-rowfacts">
        <div>
          <dt className="dla-micro">Last heartbeat</dt>
          <dd>
            <Value reading={last} />
            {age === null ? null : <span className="dla-field-note">{age}</span>}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/* --- section two: the record, band by band ---------------------------------------------- */

function Record({ diagnostics, now }: { diagnostics: LabDiagnostics; now: Date }) {
  return (
    <section className="dla-section" aria-labelledby="dla-record-heading">
      <div className="dla-section-head">
        <h2 id="dla-record-heading">The record</h2>
        <p className="dla-section-lede">
          Five bands on one surface rather than five panels, because most of them hold one row or
          none and a page of near empty boxes reads as a broken screen rather than as a quiet
          estate. Each band names what it lists, and a band with nothing in it says which kind of
          nothing: waiting on a machine, or never measured at all.
        </p>
      </div>

      <div className="dla-panel">
        <Heartbeats diagnostics={diagnostics} now={now} />
        <Verifications diagnostics={diagnostics} now={now} />
        <Pressure diagnostics={diagnostics} />
        <Quarantine diagnostics={diagnostics} />
        <ErrorCodes diagnostics={diagnostics} />
      </div>
    </section>
  );
}

/**
 * A band, and the two shapes it can take.
 *
 * `title` names what the band lists and `note` says how it is ordered and where
 * it stops, because a list capped at eight that does not say so is a list
 * making a claim about the estate it cannot support.
 */
function Band({
  title,
  note,
  children,
  tail = null,
}: {
  title: string;
  note: string;
  children: ReactNode;
  tail?: ReactNode;
}) {
  return (
    <div className="dla-group">
      <p className="dla-group-title">{title}</p>
      <p className="dla-group-note">{note}</p>
      {children}
      {tail}
    </div>
  );
}

/**
 * What a band says when it holds nothing, and the distinction the whole product
 * exists for.
 *
 * `await`, the ring, is a band empty because we are waiting on an installation:
 * something will arrive and has not. `none`, the neutral bar, is a band empty
 * because no measurement exists at all, which is not a zero and is drawn
 * nothing like one. Passing the wrong one here would tell an operator that an
 * unmeasured outbox is an empty outbox.
 */
function Nothing({ tone, word, note }: { tone: MarkTone; word: string; note: string }) {
  return (
    <div className="dla-nothing">
      <p className="dla-nothing-word">
        <StatusMark tone={tone} />
        <span>{word}</span>
      </p>
      <p className="dla-nothing-note">{note}</p>
    </div>
  );
}

/** One installation on a band: who it is, and where it lives. */
function ObsRow({ source, children }: { source: DiagnosticSource; children: ReactNode }) {
  return (
    <li className="dla-obs">
      <div className="dla-obs-id">
        <p className="dla-obs-name">{source.row.display_label}</p>
        <p className="dla-obs-where">
          <span>{source.projectName ?? "Project not named"}</span>
          <span>{environmentWord(source.row.environment)}</span>
        </p>
      </div>
      {children}
    </li>
  );
}

/** One measurement in a band's row: the micro label, and the figure or the word. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="dla-micro">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The trailing sentence that keeps a capped list honest.
 *
 * A list of eight says nothing about the ninth, so where the count of what is
 * MISSING can be derived it is stated, and where it cannot the cap is stated
 * instead. Silence would let a reader take eight rows for the whole estate.
 */
function Tail({ children }: { children: ReactNode }) {
  return <p className="dla-group-tail">{children}</p>;
}

function Heartbeats({ diagnostics, now }: { diagnostics: LabDiagnostics; now: Date }) {
  const rows = diagnostics.heartbeats;
  const silent = absentFrom(diagnostics.total, rows.length);

  return (
    <Band
      title="Recent heartbeats"
      note={`Every source that has ever been heard from, most recent first, ${count(RECENT_LIMIT).text} at most. Freshness is judged against a fifteen minute window.`}
      tail={
        silent === null ? (
          <Tail>
            This band is capped at {count(RECENT_LIMIT).text}, so it cannot say how many sources are
            absent from it.
          </Tail>
        ) : silent > 0 ? (
          <Tail>
            {count(silent).text} of {count(diagnostics.total).text}{" "}
            {plural(silent, "source is", "sources are")} absent from this band because{" "}
            {plural(silent, "it has", "they have")} never been heard from at all.
          </Tail>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <Nothing
          tone="await"
          word="No heartbeat has ever arrived"
          note="Every installation in this account is still waiting for its first one, which is where a source sits between being registered here and being activated on the machine it runs on."
        />
      ) : (
        <ul className="dla-obslist">
          {rows.map((source) => {
            const last = instant(source.row.last_heartbeat_at);
            const age = ageSince(source.row.last_heartbeat_at, now);
            return (
              <ObsRow key={source.row.source_id} source={source}>
                <dl className="dla-tally" data-cells="2">
                  <Cell label="Last heartbeat">
                    <Value reading={last} />
                    {age === null ? null : <span className="dla-field-note">{age}</span>}
                  </Cell>
                  <Cell label="Freshness">
                    <StatusChip tone={source.heartbeatFresh ? "good" : "await"}>
                      {source.heartbeatFresh ? "Fresh" : "Stale"}
                    </StatusChip>
                  </Cell>
                </dl>
              </ObsRow>
            );
          })}
        </ul>
      )}
    </Band>
  );
}

function Verifications({ diagnostics, now }: { diagnostics: LabDiagnostics; now: Date }) {
  const rows = diagnostics.verifications;
  const unproved = absentFrom(diagnostics.total, rows.length);

  return (
    <Band
      title="Recent ingestion verifications"
      note={`When an event from an installation was last proved to reach storage, most recent first, ${count(RECENT_LIMIT).text} at most. A heartbeat shows that a source can reach us; only this shows that its data lands.`}
      tail={
        unproved === null ? (
          <Tail>
            This band is capped at {count(RECENT_LIMIT).text}, so it cannot say how many sources are
            absent from it.
          </Tail>
        ) : unproved > 0 ? (
          <Tail>
            {count(unproved).text} of {count(diagnostics.total).text}{" "}
            {plural(unproved, "source has", "sources have")} never been verified. That is an absent
            proof rather than a failed one, so {plural(unproved, "it is", "they are")} left off this
            band instead of being entered as a zero.
          </Tail>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <Nothing
          tone="await"
          word="Nothing has proved that an event reaches storage"
          note="Until one does, a connected source has shown that it can reach us and nothing more. Verification happens when a diagnostic event sent by the installation is found in storage."
        />
      ) : (
        <ul className="dla-obslist">
          {rows.map((source) => (
            <ObsRow key={source.row.source_id} source={source}>
              <dl className="dla-tally" data-cells="2">
                <Cell label="Verified">
                  <Value reading={instant(source.row.ingestion_verified_at)} />
                </Cell>
                <Cell label="Age">
                  <Value reading={reported(ageSince(source.row.ingestion_verified_at, now))} />
                </Cell>
              </dl>
            </ObsRow>
          ))}
        </ul>
      )}
    </Band>
  );
}

/**
 * The pressure a plugin reported, and the pressure nobody could measure.
 *
 * A source that reported neither number is not at zero per cent and is not
 * ranked as though it were. It is counted separately, in words, under the band,
 * which is the only arrangement in which an unmeasured outbox and an empty one
 * stay two different facts.
 */
function Pressure({ diagnostics }: { diagnostics: LabDiagnostics }) {
  const rows = diagnostics.pressure;

  return (
    <Band
      title="Queue pressure"
      note={`The outbox each installation is holding, against the ceiling it was configured with, fullest first, ${count(RECENT_LIMIT).text} at most. A fill is shown only where both numbers were reported.`}
      tail={
        diagnostics.unmeasured > 0 ? (
          <Tail>
            {count(diagnostics.unmeasured).text} connected{" "}
            {plural(diagnostics.unmeasured, "source", "sources")} reported no usable outbox
            measurement, so {plural(diagnostics.unmeasured, "it is", "they are")} left out of this
            ranking rather than placed at the bottom of it.
          </Tail>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <Nothing
          tone="none"
          word="No outbox has been measured"
          note="Nothing here is at zero. Queue figures ride on the heartbeat and every field of it is optional, so an installation that cannot measure its outbox still reports that it is alive."
        />
      ) : (
        <ul className="dla-obslist">
          {rows.map((source) => {
            const pressure = pressureWord(source.queueFillPercent);
            return (
              <ObsRow key={source.row.source_id} source={source}>
                <dl className="dla-tally" data-cells="4">
                  <Cell label="Held">
                    <Value reading={bytes(source.row.queue_bytes_used)} />
                  </Cell>
                  <Cell label="Ceiling">
                    <Value reading={bytes(source.row.queue_bytes_ceiling)} />
                  </Cell>
                  <Cell label="Fill">
                    <Value reading={percent(source.queueFillPercent)} found />
                    {pressure === null ? null : (
                      <StatusChip tone={pressure.tone}>{pressure.word}</StatusChip>
                    )}
                  </Cell>
                  <Cell label="Events held">
                    <Value reading={count(source.row.queue_event_count)} />
                  </Cell>
                </dl>
              </ObsRow>
            );
          })}
        </ul>
      )}
    </Band>
  );
}

/**
 * The percentage alone was the whole signal, in colour. The word and the shape
 * are what survive greyscale and the amber nobody can separate from the green.
 */
function pressureWord(fill: number | null): { tone: MarkTone; word: string } | null {
  if (fill === null) return null;
  if (fill >= 90) return { tone: "wrong", word: "Near ceiling" };
  if (fill >= 80) return { tone: "await", word: "Filling" };
  return null;
}

function Quarantine({ diagnostics }: { diagnostics: LabDiagnostics }) {
  const rows = diagnostics.quarantines;

  return (
    <Band
      title="Quarantine activity"
      note="Events this account is not counting, worst first. Local quarantine is what the installation refused to send and backend quarantine is what we refused to accept, and the two have different fixes. A source whose counters were never reported is absent rather than listed at zero."
    >
      {rows.length === 0 ? (
        <Nothing
          tone="none"
          word="No quarantine count has been reported"
          note="Either nothing has been refused, or no installation has reported a counter. This band holds only counts that were actually reported, so an empty one is not evidence of a clean estate."
        />
      ) : (
        <ul className="dla-obslist">
          {rows.map((source) => {
            const held = (source.row.quarantine_count ?? 0) > 0;
            const refused = (source.row.backend_quarantine_count ?? 0) > 0;
            return (
              <ObsRow key={source.row.source_id} source={source}>
                <dl className="dla-tally" data-cells="4">
                  <Cell label="Local quarantine">
                    <Value reading={count(source.row.quarantine_count)} found />
                    {held ? <StatusChip tone="await">Held</StatusChip> : null}
                  </Cell>
                  <Cell label="Backend quarantine">
                    <Value reading={count(source.row.backend_quarantine_count)} found />
                    {refused ? <StatusChip tone="wrong">Refused</StatusChip> : null}
                  </Cell>
                  <Cell label="Validation failures">
                    <Value reading={count(source.row.validation_failure_count)} />
                  </Cell>
                  <Cell label="Capacity refusals">
                    <Value reading={count(source.row.capacity_refusal_count)} />
                  </Cell>
                </dl>
              </ObsRow>
            );
          })}
        </ul>
      )}
    </Band>
  );
}

function ErrorCodes({ diagnostics }: { diagnostics: LabDiagnostics }) {
  const rows = diagnostics.errors;

  return (
    <Band
      title="Recent safe error codes"
      note={`The last code each installation reported, most recently seen first, ${count(RECENT_LIMIT).text} at most. A code and never a message, because the column is bounded so an exception body can never arrive in an operational table.`}
    >
      {rows.length === 0 ? (
        <Nothing
          tone="none"
          word="No error code has been reported"
          note="The heartbeat carries at most one short code, and none of these installations has sent one. There is no message behind this, because the field cannot hold one."
        />
      ) : (
        <ul className="dla-obslist">
          {rows.map((source) => (
            <ObsRow key={source.row.source_id} source={source}>
              <dl className="dla-tally" data-cells="2">
                <Cell label="Code">
                  <span className="dla-errorcode">{source.row.last_error_code}</span>
                </Cell>
                <Cell label="Last seen">
                  <Value reading={instant(source.row.last_seen_at)} />
                </Cell>
              </dl>
            </ObsRow>
          ))}
        </ul>
      )}
    </Band>
  );
}
