import type { ReactNode } from "react";

import { StatusChip, StatusMark } from "@/components/madspace/StatusMark";
import {
  ageSince,
  bytes,
  count,
  environmentWord,
  instant,
  percent,
  sourceTypeWord,
  type Reading,
} from "@/lib/madspace/format";
import { HEALTH_LABEL, HEALTH_TONE } from "@/lib/sources/control-plane";
import { RECENT_LIMIT, type DiagnosticSource } from "@/lib/madspace/diagnostics";

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT C, DIAGNOSTICS. HYBRID EXECUTIVE.
 *
 * The same frame carrying the whole account. Graphite holds the conclusion —
 * whether anybody has work to do, and the reach of the figures under it — and
 * the paper plate holds every measurement, which here is one ruled row per
 * source per question.
 *
 * ## One row shape, six questions
 *
 * The live screen answers its corroborating sections with ruled tables. This
 * direction already owns a ruled list, and the list is the better answer HERE
 * for a reason the estate makes plain: most sections hold one row or none. A
 * five column table with a single row in it looks broken; a ruled list with one
 * row in it looks like a list with one thing in it, which is what it is. So
 * every section below is the same `.dlc-row` grammar Projects and Project
 * detail already use, with different facts in the group on the right, and the
 * whole screen reads down one set of verticals.
 *
 * It also survives 390px without a scroll container, which a five column table
 * does not.
 *
 * ## Empty is a result, or an absence, and the two never look alike
 *
 * Section one empty is an ANSWER: nobody has work to do. It gets a solid panel,
 * a state chip and a sentence, because that is a finding.
 *
 * The five below it empty are absences: nothing of that kind has been recorded
 * yet. They get the dashed empty slot this variant already uses, and each says
 * WHICH absence it is. Quarantine says it in the strongest terms available,
 * because an unreported counter and an empty one are the pair this whole
 * surface exists to keep apart, and both land in the same empty section.
 *
 * ## What is honest about a capped list
 *
 * Four of the six sections are sliced to `RECENT_LIMIT`, so their lengths are
 * how many are LISTED and not how many exist. Every count on this screen is
 * therefore taken from a list that is not sliced, or is stated only where the
 * slice provably did not bite. {@link complete} is that test, and the sentences
 * under the heartbeat and verification lists change their claim when it fails.
 * A count of rows in a truncated list, printed against the account total, is
 * the quiet lie this screen is built to refuse.
 *
 * ## What is deliberately absent
 *
 * No sparkline, no gauge, no ring, no time series and no rate. The control
 * plane persists CURRENT operational state per source, so any of those would be
 * drawn from numbers that do not exist. No filter either: the live screen has a
 * real one and this lab is not prototyping it, because a filtered read would
 * quietly narrow what three directions are being judged on.
 */

const PLURALS = new Intl.PluralRules("en-GB");

function plural(n: number, one: string, other: string): string {
  return PLURALS.select(n) === "one" ? one : other;
}

/** A figure inside a sentence, through the one pinned `Intl` these screens share. */
function figure(value: number): string {
  return count(value).text;
}

/**
 * Whether a sliced section listed everything there was.
 *
 * `recentHeartbeats` and its three siblings return at most `RECENT_LIMIT` rows.
 * A list shorter than the cap could not have been truncated, so its length is
 * the whole count and may be stated against the account total. A list AT the
 * cap may or may not be, and nothing is claimed from it.
 */
function complete(rows: readonly DiagnosticSource[]): boolean {
  return rows.length < RECENT_LIMIT;
}

/** A relative age as a reading, so an unreadable timestamp is not printed as a span. */
function age(at: string | null, now: Date): Reading {
  const said = ageSince(at, now);
  return said === null ? { text: "Not readable", missing: true } : { text: said, missing: false };
}

/* --- the pieces every section is built from ------------------------------------------- */

/** A value, or the word that stands where a value is not. */
function Value({ reading }: { reading: Reading }) {
  if (!reading.missing) return <span className="dlc-value">{reading.text}</span>;

  return (
    <span className="dlc-value" data-missing="true">
      <StatusMark tone="none" />
      <span>{reading.text}</span>
    </span>
  );
}

/** One labelled reading in a row's fact group. */
function Fact({ label, reading }: { label: string; reading: Reading }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <Value reading={reading} />
      </dd>
    </div>
  );
}

/** One count, and the whole it is a part of. The "of N" may dim, never vanish. */
function Tally({ label, part, whole }: { label: string; part: number; whole?: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="dlc-figure">{figure(part)}</span>
        {whole === undefined ? null : <span className="dlc-of">of {figure(whole)}</span>}
      </dd>
    </div>
  );
}

/**
 * A row's identity: what kind of installation, what it is called, and where.
 *
 * The project and the environment are read together with the name — "Main
 * Showroom PC" means nothing without knowing which building it is in — so they
 * sit on the row rather than in columns of their own. Both are plain words
 * rather than chips: they are authoritative facts and not states, and giving
 * them the chip treatment would put them at the weight of the state beside
 * them.
 */
function RowId({
  source,
  children,
}: {
  source: DiagnosticSource;
  /** The state chip this section reads the row for, where it has one. */
  children?: ReactNode;
}) {
  return (
    <div className="dlc-row-id">
      <p className="dlc-micro">{sourceTypeWord(source.row.source_type)}</p>
      <h3 className="dlc-row-name">{source.row.display_label}</h3>
      <div className="dlc-row-chips">
        {children}
        <span className="dlc-tag">{source.projectName ?? "Project not named"}</span>
        <span className="dlc-tag">{environmentWord(source.row.environment)}</span>
        {source.row.environment_mismatch ? (
          <StatusChip tone="wrong">Environment mismatch</StatusChip>
        ) : null}
      </div>
    </div>
  );
}

/**
 * An answer, drawn as one.
 *
 * Section one holding nothing is a FINDING and gets the solid panel the rest of
 * the screen gives to facts: a state chip, a title at the content step, and the
 * sentence that says what is now true. Nothing about it reads as a panel that
 * failed to load, which is what the dashed empty slot below would say.
 */
function Result({
  tone,
  word,
  title,
  note,
}: {
  tone: "good";
  word: string;
  title: string;
  note: string;
}) {
  return (
    <div className="dlc-result" role="status">
      <div className="dlc-result-head">
        <StatusChip tone={tone}>{word}</StatusChip>
        <p className="dlc-result-title">{title}</p>
      </div>
      <p className="dlc-result-note">{note}</p>
    </div>
  );
}

/**
 * An absence, drawn as one.
 *
 * The dashed border is this variant's own token for an empty slot, so the shape
 * says "nothing has been recorded here yet" before the words do. It is not a
 * warning and is not drawn as one. `note` always names WHICH absence it is,
 * because a section empty for want of a measurement and a section empty because
 * nothing happened are two different statements about the estate.
 */
function Empty({ title, note }: { title: string; note: string }) {
  return (
    <div className="dlc-empty">
      <p className="dlc-empty-title">{title}</p>
      <p className="dlc-empty-note">{note}</p>
    </div>
  );
}

/* --- the sections --------------------------------------------------------------------- */

function AlertRow({ source, now }: { source: DiagnosticSource; now: Date }) {
  const last = instant(source.row.last_heartbeat_at);
  const since = ageSince(source.row.last_heartbeat_at, now);

  return (
    <li className="dlc-row" data-shape="alert">
      <RowId source={source}>
        <StatusChip tone={HEALTH_TONE[source.health]}>{HEALTH_LABEL[source.health]}</StatusChip>
      </RowId>

      <div className="dlc-alert-body">
        {/* The chip above says WHAT. This says WHY, in words and never in a colour. */}
        <p className="dlc-row-reason">{source.reason}</p>
        <dl className="dlc-when">
          <div>
            <dt>Last heartbeat</dt>
            <dd>
              <Value reading={last} />
              {since === null ? null : <span className="dlc-age">{since}</span>}
            </dd>
          </div>
        </dl>
      </div>

      <div className="dlc-row-go">
        <button type="button" className="dlc-btn" data-kind="secondary">
          Open source
        </button>
      </div>
    </li>
  );
}

function FactRow({
  source,
  children,
  chip,
  cols,
}: {
  source: DiagnosticSource;
  children: ReactNode;
  chip?: ReactNode;
  cols: "2" | "4";
}) {
  return (
    <li className="dlc-row" data-shape="fact">
      <RowId source={source}>{chip}</RowId>
      <dl className="dlc-when" data-cols={cols}>
        {children}
      </dl>
    </li>
  );
}

export function DiagnosticsC({ estate, variantName }: LabScreenProps) {
  const name = variantName;
  const now = estate.now;
  const d = estate.diagnostics;
  const total = d.total;

  /*
   * `attention` and `quarantines` are NOT sliced, so their lengths are counts of
   * the account and may stand against the total. The other four are sliced, and
   * nothing on this screen divides by one of them.
   */
  const alerts = d.attention;
  const worst = alerts[0];

  const heartbeatsComplete = complete(d.heartbeats);
  const neverHeard = heartbeatsComplete ? total - d.heartbeats.length : null;
  const verificationsComplete = complete(d.verifications);
  const unproved = verificationsComplete ? total - d.verifications.length : null;

  const readAt = instant(now.toISOString());

  /*
   * The whole screen in one sentence, and it names the worst source rather than
   * counting problems: the commonest reading of this page ends after this line,
   * and a count does not tell anybody where to go.
   */
  const answer =
    total === 0
      ? "This account holds no sources, so there is nothing to diagnose."
      : worst === undefined
        ? `${figure(total)} ${plural(total, "source", "sources")} in this account. None is offline, holding refused events or suspended, so nothing on this screen needs an operator right now.`
        : `${figure(total)} ${plural(total, "source", "sources")} in this account. ${figure(alerts.length)} of ${figure(total)} ${plural(alerts.length, "requires", "require")} an operator, worst first. ${worst.row.display_label} is ${HEALTH_LABEL[worst.health].toLowerCase()}.`;

  return (
    <div className="dlc-root dlc-graphite">
      <a className="dlc-skip" href="#dlc-work">
        Skip to the sources requiring attention
      </a>

      <div className="dlc-frame">
        <div className="dlc-rail">
          <p className="dlc-rail-mark">
            IRIS Observer <span>MADSPACE operations</span>
          </p>
          <p className="dlc-rail-lab">Design lab &middot; Variant C &middot; {name}</p>
        </div>

        <header>
          <div className="dlc-mast-grid">
            <div className="dlc-mast-text">
              <p className="dlc-kicker">Account operations</p>
              <h1 className="dlc-title">Diagnostics</h1>
              <p className="dlc-answer">{answer}</p>
              {/*
               * THE VERDICT SLOT, AND WHAT MAY HONESTLY STAND IN IT.
               *
               * Projects refuses a chip here, because an estate has no single
               * state. This one is not a state either: it is the answer to
               * "is the list below empty", which is a proposition about a list
               * rather than an average of seven sources. The note says exactly
               * that, so the two screens cannot be read as disagreeing.
               */}
              <div className="dlc-verdict">
                {total === 0 ? (
                  <StatusChip tone="none">Nothing to diagnose</StatusChip>
                ) : alerts.length > 0 ? (
                  <StatusChip tone="wrong">Needs an operator</StatusChip>
                ) : (
                  <StatusChip tone="good">No operator needed</StatusChip>
                )}
                <span className="dlc-verdict-note">
                  Whether anybody has work to do, and nothing more. It is not a health verdict for
                  the account: there is no one state for an estate, and every state on this screen
                  belongs to a source and is drawn on the row that owns it.
                </span>
              </div>
            </div>
          </div>

          {/*
           * The scope band. The reach of these figures decides what all of them
           * mean, so it is a value at the value step rather than a grey note:
           * every figure below covers the whole account.
           */}
          <dl className="dlc-scope">
            <div>
              <dt>Account</dt>
              <dd>
                <span className="dlc-value">{estate.accountName}</span>
              </dd>
            </div>
            <div>
              <dt>Control plane</dt>
              <dd>
                <span className="dlc-value">{estate.local ? "Local" : "Remote"}</span>
              </dd>
            </div>
            <div>
              <dt>Read at</dt>
              <dd>
                <Value reading={readAt} />
              </dd>
            </div>
            <div>
              <dt>Covers</dt>
              <dd>
                <span className="dlc-value">Every project, environment and source</span>
              </dd>
            </div>
          </dl>
        </header>

        <div id="dlc-work" className="dlc-plate dlc-paper">
          {/* --- 1. who has work to do -------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-attention">
            <div className="dlc-region-head">
              <h2 id="dlc-attention">Sources requiring attention</h2>
              <p className="dlc-lede">
                Offline, refusing events, or switched off deliberately. Worst first, then production
                before staging, then whichever has been silent longest. Every row says in words why
                it is here, because the state word alone does not let an operator decide whether to
                open it or leave it.
              </p>
              <details className="dlc-note">
                <summary>How the order is decided</summary>
                <dl className="dlc-note-body">
                  <div>
                    <dt>Offline above needs attention</dt>
                    <dd>
                      An installation saying nothing at all is worse than one whose events are
                      partly being refused, because nothing is known about the first.
                    </dd>
                  </div>
                  <div>
                    <dt>Suspended below both</dt>
                    <dd>
                      It is a state somebody chose. Its silence is expected rather than a fault, and
                      it is listed here so that a source nobody meant to leave off is not invisible.
                    </dd>
                  </div>
                  <div>
                    <dt>Never connected is not here</dt>
                    <dd>
                      A source registered and not yet activated has not failed at anything. It is a
                      wait on the installer, and an alarm on every newly created source is how an
                      operations screen teaches people to ignore it.
                    </dd>
                  </div>
                </dl>
              </details>
            </div>

            {total === 0 ? (
              <Empty
                title="This account holds no sources"
                note="There is nothing to diagnose rather than nothing wrong. A source is registered against a project and then activated from the machine it runs on, so the first row here appears once one exists."
              />
            ) : alerts.length === 0 ? (
              <Result
                tone="good"
                word="No operator needed"
                title="Nothing requires attention"
                note={
                  neverHeard === null || neverHeard === 0
                    ? "No source in this account is offline, holding refused events or suspended. This is a finding about every source in the account rather than an empty panel."
                    : `No source in this account is offline, holding refused events or suspended. ${figure(neverHeard)} of ${figure(total)} ${plural(neverHeard, "is", "are")} still waiting for a first heartbeat, which is a wait on the installer rather than a fault.`
                }
              />
            ) : (
              <>
                <ol className="dlc-list">
                  {alerts.map((source) => (
                    <AlertRow key={source.row.source_id} source={source} now={now} />
                  ))}
                </ol>
                <p className="dlc-hint">
                  The control on each row is inert in the design lab. Nothing on this route
                  navigates and nothing writes to the control plane.
                </p>
              </>
            )}
          </section>

          {/* --- 2. the account in four counts ------------------------------ */}
          <section className="dlc-region" aria-labelledby="dlc-counts">
            <div className="dlc-region-head">
              <h2 id="dlc-counts">The account in four counts</h2>
              <p className="dlc-lede">
                Every one of them is a count of rows against the same denominator, because a bare
                count is not a fact and a count against the whole is. They are counts of sources in
                a state, never a measurement a plugin might have failed to report, and there is no
                figure across them: an account has no score.
              </p>
            </div>

            <dl className="dlc-panel">
              <Tally label="Sources" part={total} />
              <Tally label="Requiring an operator" part={alerts.length} whole={total} />
              <Tally
                label="With a refusal on the record"
                part={d.quarantines.length}
                whole={total}
              />
              <Tally label="No outbox measurement" part={d.unmeasured} whole={total} />
            </dl>

            <p className="dlc-hint">
              The last count is the one that is easiest to misread. Those sources are not at zero
              per cent. They connected and reported no usable outbox measurement, so they are absent
              from the queue list rather than at the bottom of it.
            </p>
          </section>

          {/* --- 3. heartbeats ---------------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-heartbeats">
            <div className="dlc-region-head">
              <h2 id="dlc-heartbeats">Recent heartbeats</h2>
              <p className="dlc-lede">
                When each installation last said it was alive, most recent first, at most{" "}
                {figure(RECENT_LIMIT)} listed. Freshness is judged against a fifteen minute window,
                and a source that has never been heard from is a different fact from an old
                heartbeat, so it is absent from this list rather than entered at the bottom of it.
              </p>
            </div>

            {d.heartbeats.length === 0 ? (
              <Empty
                title="No heartbeat has ever been accepted from a source in this account"
                note="Every installation here is still waiting for its first one. That is the state a source sits in between being registered and being activated on the machine it runs on."
              />
            ) : (
              <ul className="dlc-list">
                {d.heartbeats.map((source) => (
                  <FactRow
                    key={source.row.source_id}
                    source={source}
                    cols="2"
                    chip={
                      <StatusChip tone={source.heartbeatFresh ? "good" : "await"}>
                        {source.heartbeatFresh ? "Fresh" : "Stale"}
                      </StatusChip>
                    }
                  >
                    <Fact
                      label="Last heartbeat (UTC)"
                      reading={instant(source.row.last_heartbeat_at)}
                    />
                    <Fact label="Age" reading={age(source.row.last_heartbeat_at, now)} />
                  </FactRow>
                ))}
              </ul>
            )}

            <p className="dlc-hint">
              {neverHeard === null
                ? `The list is at its cap of ${figure(RECENT_LIMIT)}, so this screen cannot say how many sources have never been heard from without claiming more than it read.`
                : neverHeard === 0
                  ? "Every source in this account has been heard from at least once."
                  : `${figure(neverHeard)} of ${figure(total)} ${plural(neverHeard, "source has", "sources have")} never been heard from at all.`}
            </p>
          </section>

          {/* --- 4. ingestion verifications --------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-verifications">
            <div className="dlc-region-head">
              <h2 id="dlc-verifications">Recent ingestion verifications</h2>
              <p className="dlc-lede">
                When an event from each installation was last proved to reach storage, most recent
                first, at most {figure(RECENT_LIMIT)} listed. A heartbeat says a source can talk to
                us; only this says its data lands.
              </p>
              <details className="dlc-note">
                <summary>Why a never verified source is not listed here</summary>
                <dl className="dlc-note-body">
                  <div>
                    <dt>An absent proof, not a failed one</dt>
                    <dd>
                      Nothing has been tried and refused. No event has yet been found in storage, so
                      there is no instant to list, and entering the source with a zero would turn an
                      absent proof into a failed one.
                    </dd>
                  </div>
                  <div>
                    <dt>What a verification is not</dt>
                    <dd>
                      It is one event that reached storage at least once. It is not a rate and not a
                      guarantee that the next one will.
                    </dd>
                  </div>
                </dl>
              </details>
            </div>

            {d.verifications.length === 0 ? (
              <Empty
                title="No source in this account has proved that an event reaches storage"
                note="Until one does, a connected source has shown that it can reach us and nothing more. This section is empty because no proof exists yet, not because a proof was sought and refused."
              />
            ) : (
              <ul className="dlc-list">
                {d.verifications.map((source) => (
                  <FactRow key={source.row.source_id} source={source} cols="2">
                    <Fact
                      label="Verified (UTC)"
                      reading={instant(source.row.ingestion_verified_at)}
                    />
                    <Fact label="Age" reading={age(source.row.ingestion_verified_at, now)} />
                  </FactRow>
                ))}
              </ul>
            )}

            <p className="dlc-hint">
              {unproved === null
                ? `The list is at its cap of ${figure(RECENT_LIMIT)}, so this screen cannot say how many sources have never been verified without claiming more than it read.`
                : unproved === 0
                  ? "Every source in this account has proved an event reaches storage at least once."
                  : `${figure(unproved)} of ${figure(total)} ${plural(unproved, "source has", "sources have")} never been verified.`}
            </p>
          </section>

          {/* --- 5. queue pressure ------------------------------------------ */}
          <section className="dlc-region" aria-labelledby="dlc-queues">
            <div className="dlc-region-head">
              <h2 id="dlc-queues">Queue pressure</h2>
              <p className="dlc-lede">
                The outbox each installation is holding, against the ceiling it was configured with,
                fullest first. A fill is shown only where both numbers were reported. An unmeasured
                outbox is not an empty one, so it is left out of this ranking rather than placed at
                the bottom of it, and the count of those is stated underneath.
              </p>
            </div>

            {d.pressure.length === 0 ? (
              <Empty
                title="No outbox measurement has been reported by a source in this account"
                note="Nothing here is at zero. Nothing here has been measured. Queue figures ride on the heartbeat and every field of it is optional, so an installation that cannot measure its outbox still reports that it is alive."
              />
            ) : (
              <ul className="dlc-list">
                {d.pressure.map((source) => {
                  const fill = source.queueFillPercent;
                  /*
                   * The percentage alone was the whole signal, in colour. The
                   * word and the shape are what survive greyscale and the amber
                   * nobody can separate from the green. Neither is drawn where
                   * the fill is below the thresholds, because a chip on every
                   * row would make the two that matter invisible.
                   */
                  const pressure =
                    fill === null
                      ? null
                      : fill >= 90
                        ? ({ tone: "wrong", word: "Near ceiling" } as const)
                        : fill >= 80
                          ? ({ tone: "await", word: "Filling" } as const)
                          : null;
                  return (
                    <FactRow
                      key={source.row.source_id}
                      source={source}
                      cols="4"
                      chip={
                        pressure === null ? null : (
                          <StatusChip tone={pressure.tone}>{pressure.word}</StatusChip>
                        )
                      }
                    >
                      <Fact label="Used" reading={bytes(source.row.queue_bytes_used)} />
                      <Fact label="Ceiling" reading={bytes(source.row.queue_bytes_ceiling)} />
                      <Fact label="Fill" reading={percent(fill)} />
                      <Fact label="Events held" reading={count(source.row.queue_event_count)} />
                    </FactRow>
                  );
                })}
              </ul>
            )}

            {d.unmeasured === 0 ? null : (
              <p className="dlc-hint">
                {figure(d.unmeasured)} connected {plural(d.unmeasured, "source", "sources")}{" "}
                {plural(d.unmeasured, "reports", "report")} no usable outbox measurement, so{" "}
                {plural(d.unmeasured, "it is", "they are")} absent from this list.
              </p>
            )}
          </section>

          {/* --- 6. quarantine ---------------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-quarantine">
            <div className="dlc-region-head">
              <h2 id="dlc-quarantine">Quarantine activity</h2>
              <p className="dlc-lede">
                Events this account is not counting. Local quarantine is what the installation
                refused to send; backend quarantine is what we refused to accept, and the two have
                different fixes. Only counts that were actually reported are listed, so an
                installation that has never reported a counter is absent rather than clean.
              </p>
            </div>

            {d.quarantines.length === 0 ? (
              <Empty
                title="No source in this account has reported a quarantined event"
                note="Two different situations land here and this screen cannot tell them apart: either nothing has been refused, or no installation has reported a quarantine counter yet. An unreported counter is not evidence of a clean estate, and it is never entered here as a zero."
              />
            ) : (
              <ul className="dlc-list">
                {d.quarantines.map((source) => {
                  const held = (source.row.quarantine_count ?? 0) > 0;
                  const refused = (source.row.backend_quarantine_count ?? 0) > 0;
                  return (
                    <FactRow
                      key={source.row.source_id}
                      source={source}
                      cols="4"
                      chip={
                        <>
                          {held ? <StatusChip tone="await">Held locally</StatusChip> : null}
                          {refused ? (
                            <StatusChip tone="wrong">Refused at the backend</StatusChip>
                          ) : null}
                        </>
                      }
                    >
                      <Fact label="Local quarantine" reading={count(source.row.quarantine_count)} />
                      <Fact
                        label="Backend quarantine"
                        reading={count(source.row.backend_quarantine_count)}
                      />
                      <Fact
                        label="Validation failures"
                        reading={count(source.row.validation_failure_count)}
                      />
                      <Fact
                        label="Capacity refusals"
                        reading={count(source.row.capacity_refusal_count)}
                      />
                    </FactRow>
                  );
                })}
              </ul>
            )}
          </section>

          {/* --- 7. error codes ---------------------------------------------- */}
          <section className="dlc-region" aria-labelledby="dlc-errors">
            <div className="dlc-region-head">
              <h2 id="dlc-errors">Recent safe error codes</h2>
              <p className="dlc-lede">
                The last code each installation reported, most recently seen first, at most{" "}
                {figure(RECENT_LIMIT)} listed. A code and never a message: the column is bounded so
                that an exception body with a visitor's name inside it can never arrive in an
                operational table.
              </p>
            </div>

            {d.errors.length === 0 ? (
              <Empty
                title="No source in this account has reported an error code"
                note="The heartbeat carries at most one short code, and none of these installations has sent one. There is no message behind this, because the field cannot hold one."
              />
            ) : (
              <ul className="dlc-list">
                {d.errors.map((source) => (
                  <FactRow key={source.row.source_id} source={source} cols="2">
                    <div>
                      <dt>Code</dt>
                      <dd>
                        <span className="dlc-code-token">{source.row.last_error_code}</span>
                      </dd>
                    </div>
                    <Fact label="Last seen (UTC)" reading={instant(source.row.last_seen_at)} />
                  </FactRow>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="dlc-foot">
          <p>Development instrument. Nothing on this route writes to the control plane.</p>
        </footer>
      </div>
    </div>
  );
}
