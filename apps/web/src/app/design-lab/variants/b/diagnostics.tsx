import type { ReactNode } from "react";

import { StatusChip, StatusMark } from "@/components/madspace/StatusMark";
import { HEALTH_LABEL, HEALTH_TONE } from "@/lib/sources/control-plane";
import { RECENT_LIMIT, type DiagnosticSource } from "@/lib/madspace/diagnostics";
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

import type { LabScreenProps } from "../../lab-data";

/**
 * VARIANT B. GRAPHITE CONSOLE. THE ACCOUNT, ON A BAD DAY.
 *
 * The furniture is the furniture of the four screens before it and nothing on
 * this one is drawn a second way: the rail, the masthead, the section head with
 * its note, the answer band on its 11.5rem spine, the ruled list with a column
 * rail on the raised colour and rows on the panel colour, the labelled band
 * that divides a list, the ledger of counts, the neutral bar for a measurement
 * that does not exist, and the chip that carries a shape, a colour and a word.
 *
 * ## One question, asked first
 *
 * Does anybody have work to do. So the answer band is the first thing under the
 * masthead, it states the count against the whole account rather than a score,
 * and the attention list sits inside the SAME panel directly beneath it, on the
 * same vertical rule. Everything below that panel is corroboration and reads as
 * corroboration: the same table, quieter, one subject each.
 *
 * ## An empty attention list is a RESULT
 *
 * It keeps the panel, the answer band above it and the chip that says which
 * proposition is now true, and it names what IS still waiting so the sentence
 * cannot be read as "the estate is fine". A section that vanished, or that fell
 * back to a dashed box, would look like a panel that failed to load on exactly
 * the day a reader most needs to trust it.
 *
 * ## No measurement is not a zero, anywhere on this screen
 *
 * Four different absences are kept apart. A recency table LEAVES OUT a source
 * that has never done the thing and then counts it in words underneath, so an
 * absent proof is never entered as a stale one. A queue with no usable
 * measurement is counted separately from the ranking rather than placed at the
 * bottom of it. A counter the plugin did not report renders as the neutral bar
 * and the word, never as 0. And an empty section says WHICH kind of empty it
 * is, or says plainly that the two cannot be told apart here.
 *
 * ## What this screen is not
 *
 * No sparkline, no gauge, no ring, no trend, no rate. Every figure is a state
 * persisted for a source and read once for the whole account; a line drawn
 * through them would be drawn through numbers that do not exist. No analytics
 * either: what an installation observed belongs to Observer, whether it
 * observes at all belongs here. And no verdict of this screen's own invention:
 * the word and the mark for a source's health both come from `HEALTH_LABEL` and
 * `HEALTH_TONE`.
 */

/**
 * Plurals through `Intl`, with the locale pinned.
 *
 * The accessibility contract requires plurals selected rather than chosen by a
 * ternary on the number, and pinned for the reason `format.ts` pins its
 * instants: these pages are server-rendered, so an unpinned formatter prints
 * whatever locale the host happens to run under.
 */
const PLURALS = new Intl.PluralRules("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/**
 * A figure inside a sentence, through the same formatter the cells use.
 *
 * A thousand sources should be grouped the same way in a sentence and in a
 * table cell, and a second `Intl.NumberFormat` declared here is how that stops
 * being true.
 */
function figure(value: number): string {
  return count(value).text;
}

/**
 * A measurement, or the fact that there is none.
 *
 * The pair of treatments this direction draws everywhere. An absent value loses
 * the medium weight and the tabular figures and carries the neutral bar, which
 * this system draws for "no measurement exists" and never for a zero.
 */
function Value({ reading }: { reading: Reading }) {
  if (reading.missing) {
    return (
      <span className="dlb-absent" data-scale="row">
        <StatusMark tone="none" />
        <span>{reading.text}</span>
      </span>
    );
  }
  return <span className="dlb-rowvalue">{reading.text}</span>;
}

/**
 * A source, as the first cell of a table: its label over its project.
 *
 * The project rides on the row rather than taking a column of its own, because
 * the two are read together. "Main Showroom PC" means nothing without knowing
 * which building it is in, and a separate column would set the two facts apart
 * by a hairline for no reading benefit.
 */
function SourceCell({ source }: { source: DiagnosticSource }) {
  return (
    <div className="dlb-rowcell">
      <span className="dlb-rowlabel">Source</span>
      <h3 className="dlb-rowname">{source.row.display_label}</h3>
      <p className="dlb-rownote">
        {source.projectName ?? "Project not named"} · {environmentWord(source.row.environment)}
      </p>
    </div>
  );
}

/** The column rail plus the rows, on the panel every list in this direction sits in. */
function Table({
  columns,
  heads,
  children,
}: {
  columns: string;
  heads: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="dlb-hero">
      <div className="dlb-table" data-columns={columns}>
        {/*
         * `aria-hidden`, because every label it shows also travels inside the
         * cell it labels, visually hidden while this is on screen, and it is
         * what remains once the columns collapse.
         */}
        <div className="dlb-thead" aria-hidden="true">
          {heads.map((head) => (
            <p className="dlb-th" key={head}>
              {head}
            </p>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * What a section says when it has no rows, and WHICH kind of empty it is.
 *
 * Never "No results". A reader has to be able to tell "nothing has happened
 * yet" from "nothing was measured", and where the two genuinely cannot be told
 * apart the band says that instead of picking one.
 */
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="dlb-empty">
      <p className="dlb-emptytitle">{title}</p>
      <p className="dlb-rownote">{detail}</p>
    </div>
  );
}

/** The sentence under a table. Null when there is nothing to say. */
function TableNote({ children }: { children: string | null }) {
  if (children === null) return null;
  return <p className="dlb-tablenote">{children}</p>;
}

/**
 * How many sources are NOT on a recency table, or null when it cannot be said.
 *
 * The recency sections are sliced to `RECENT_LIMIT`, so subtracting the row
 * count from the estate is only true while the slice did not bite. When it did,
 * the honest answer is that this screen cannot state the figure from what it
 * was given, and it says so rather than printing a subtraction that is wrong by
 * however many rows the slice dropped.
 */
function absentFrom(total: number, rows: readonly DiagnosticSource[]): number | null {
  return rows.length >= RECENT_LIMIT ? null : total - rows.length;
}

function absenceNote(
  total: number,
  rows: readonly DiagnosticSource[],
  sentence: (absent: number) => string,
): string | null {
  const absent = absentFrom(total, rows);
  if (absent === null) {
    return `The list above is capped at ${figure(RECENT_LIMIT)} rows, so how many sources are absent from it is not stated here.`;
  }
  return absent <= 0 ? null : sentence(absent);
}

/**
 * The whole screen in one sentence, and it names the worst source rather than
 * counting problems.
 *
 * The commonest reading of this page ends after this line, and a count does not
 * tell anybody where to go. The branch order and the vocabulary are the live
 * screen's, so the two cannot answer the same question differently.
 */
function answer(total: number, attention: readonly DiagnosticSource[]): string {
  if (total === 0) return "This account holds no sources, so there is nothing to diagnose.";

  const scope = `${figure(total)} ${plural(total, "source", "sources")} in this account.`;
  const worst = attention[0];
  if (worst === undefined) {
    return `${scope} None is offline, refusing events or suspended, so nothing on this screen needs an operator right now.`;
  }
  return `${scope} ${figure(attention.length)} ${plural(attention.length, "requires", "require")} attention, worst first. ${worst.row.display_label} is ${HEALTH_LABEL[worst.health].toLowerCase()}.`;
}

/* --- section one: whether anybody has work to do ---------------------------------- */

function AttentionRow({ source, now }: { source: DiagnosticSource; now: Date }) {
  const heartbeat = instant(source.row.last_heartbeat_at, "No heartbeat has ever arrived");
  const age = ageSince(source.row.last_heartbeat_at, now);
  /*
   * `reasonFor` composes a sentence for every verdict this list can hold, so
   * the absent branch is unreachable in practice. It is still rendered as an
   * absence rather than as an empty cell, because a blank where the reason
   * belongs is the one place on this screen a reader would fill in their own.
   */
  const why = reported(source.reason);

  return (
    <article className="dlb-row" data-static="true">
      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Source</span>
        <div className="dlb-chips">
          {/* The verdict, from the one shared table. Never a colour on its own. */}
          <StatusChip tone={HEALTH_TONE[source.health]}>{HEALTH_LABEL[source.health]}</StatusChip>
          {source.row.environment_mismatch ? (
            <StatusChip tone="wrong">Environment mismatch</StatusChip>
          ) : null}
        </div>
        <h3 className="dlb-rowname">{source.row.display_label}</h3>
        <p className="dlb-rownote">
          {source.projectName ?? "Project not named"} · {environmentWord(source.row.environment)} ·{" "}
          {sourceTypeWord(source.row.source_type)}
        </p>
      </div>

      <div className="dlb-rowcell">
        {/* The word above says WHAT. This says WHY, in the units the plugin reported. */}
        <span className="dlb-rowlabel">Why</span>
        {why.missing ? <Value reading={why} /> : <p className="dlb-consequence">{why.text}</p>}
      </div>

      <div className="dlb-rowcell">
        <span className="dlb-rowlabel">Last heartbeat</span>
        <Value reading={heartbeat} />
        {age === null ? null : <p className="dlb-rownote">{age}</p>}
      </div>
    </article>
  );
}

/**
 * The empty attention list, built to look like an answer.
 *
 * It sits in the same panel slot the rows would have taken, on the same spine
 * the answer band above it uses, and it carries a chip so the proposition has a
 * shape as well as a sentence. What is still waiting is named beside it,
 * because "nothing requires attention" alone reads as "the estate is fine" and
 * a source that has never been heard from is neither.
 */
function AttentionResult({ waiting, unverified }: { waiting: number; unverified: number }) {
  const clauses: string[] = [];
  if (waiting > 0) {
    clauses.push(
      `${figure(waiting)} ${plural(waiting, "is", "are")} still waiting for a first heartbeat, which is where a newly registered installation sits until somebody activates it.`,
    );
  }
  if (unverified > 0) {
    clauses.push(
      `${figure(unverified)} ${plural(unverified, "has", "have")} connected without yet proving an event reaches storage.`,
    );
  }

  return (
    <div className="dlb-result">
      <div className="dlb-result-rail">
        <p className="dlb-spinelabel">Result</p>
        <StatusChip tone="good">No operator needed</StatusChip>
      </div>
      <div className="dlb-result-body">
        <p className="dlb-resulttitle">Nothing requires attention</p>
        <p className="dlb-consequence">
          No source in this account is offline, holding refused events or suspended.
          {clauses.length === 0 ? "" : ` ${clauses.join(" ")}`}
        </p>
      </div>
    </div>
  );
}

/* --- the screen ------------------------------------------------------------------- */

export function DiagnosticsB({ estate, screenName, variantName }: LabScreenProps) {
  const d = estate.diagnostics;
  const now = estate.now;

  /*
   * The read instant, through the same formatter every other date on this
   * screen goes through. `toISOString` is the transport form rather than a
   * second way of printing a date: `instant` still decides what a reader sees.
   */
  const readAt = instant(now.toISOString());

  const attention = d.attention;
  /*
   * Both through the cap guard. A subtraction against a sliced list is only
   * true while the slice did not bite, and `?? 0` here means "cannot be stated
   * from what this screen was given", which the result band then does not
   * state rather than stating wrongly.
   */
  const waiting = absentFrom(d.total, d.heartbeats) ?? 0;
  const unverified = absentFrom(d.total, d.verifications) ?? 0;

  const verdict =
    d.total === 0 ? (
      <StatusChip tone="none">Nothing to diagnose</StatusChip>
    ) : attention.length > 0 ? (
      <StatusChip tone="wrong">Needs an operator</StatusChip>
    ) : (
      <StatusChip tone="good">No operator needed</StatusChip>
    );

  return (
    <div className="dlb-root">
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
            <p className="dlb-eyebrow">Account estate</p>
            <h1 className="dlb-title">Diagnostics</h1>
            <div className="dlb-meta">
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Account</span>
                <span className="dlb-meta-value">{estate.accountName}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Projects</span>
                <span className="dlb-meta-value">{figure(estate.projects.length)}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Sources</span>
                <span className="dlb-meta-value">{figure(d.total)}</span>
              </span>
              <span className="dlb-meta-item">
                <span className="dlb-meta-key">Read at</span>
                <span className="dlb-meta-value">{readAt.text}</span>
              </span>
            </div>
          </div>

          {/*
           * No control block on this screen, and the omission is the honest
           * one. What this view carries in the product is a filter, the lab
           * reads the estate unnarrowed on purpose so three directions are
           * judged on the same rows, and drawing a control that stands for
           * something not being prototyped would be furniture. The scope band
           * below says so in words instead.
           */}
        </div>

        <div className="dlb-scope">
          <p className="dlb-spinelabel">Scope</p>
          <p className="dlb-scopetext">
            Every project, every environment and every source in this account, read once. The
            product narrows this view with a filter; the design lab deliberately does not, so every
            figure below covers the whole estate.
          </p>
        </div>

        {/* --- 1. does anybody have work to do --- */}
        <section className="dlb-section" aria-labelledby="dlb-attention-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-attention-heading">
              Sources requiring attention
            </h2>
            <p className="dlb-sectionnote">
              Offline, refusing events, or switched off deliberately. Worst first, then production
              before staging, then whichever has been silent longest.
            </p>
          </div>

          <div className="dlb-hero">
            <div className="dlb-answerband">
              <div className="dlb-answerband-rail">
                <p className="dlb-spinelabel">Requiring an operator</p>
                {/*
                 * A count against the denominator it was counted from, never a
                 * score and never a percentage across the three states. The
                 * denominator may shrink and dim; it may never be dropped.
                 */}
                <p className="dlb-figure">
                  {figure(attention.length)}
                  <span className="dlb-of"> of {figure(d.total)}</span>
                </p>
                {verdict}
              </div>
              <div className="dlb-answerband-body">
                <div>
                  <p className="dlb-answer">{answer(d.total, attention)}</p>
                  <p className="dlb-answernote">
                    Every figure on this screen is a state persisted for a source and read once for
                    the whole account. It is not a rate, not a trend and never an analytic.
                  </p>
                </div>
              </div>
            </div>

            {attention.length === 0 ? (
              <AttentionResult waiting={waiting} unverified={unverified} />
            ) : (
              <div className="dlb-table" data-columns="attention">
                <div className="dlb-thead" aria-hidden="true">
                  <p className="dlb-th">Source</p>
                  <p className="dlb-th">Why</p>
                  <p className="dlb-th">Last heartbeat</p>
                </div>
                {attention.map((source) => (
                  <AttentionRow key={source.row.source_id} source={source} now={now} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* --- 2. the counts that carry a denominator --- */}
        <section className="dlb-section" aria-labelledby="dlb-counts-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-counts-heading">
              Counts across the account
            </h2>
            <p className="dlb-sectionnote">
              Counts of sources, each against the same denominator. None of them is a measurement a
              plugin might have failed to report.
            </p>
          </div>

          <div className="dlb-ledger">
            <div className="dlb-cell">
              <p className="dlb-cell-label">Sources</p>
              <p className="dlb-cell-value">
                <span className="dlb-tallyfig">{figure(d.total)}</span>
              </p>
              <p className="dlb-cell-note">
                Registered under this account, in every project and every environment.
              </p>
            </div>

            <div className="dlb-cell">
              <p className="dlb-cell-label">Requiring an operator</p>
              <p className="dlb-cell-value">
                <span className="dlb-tallyfig">{figure(attention.length)}</span>
                <span className="dlb-of"> of {figure(d.total)}</span>
              </p>
              <p className="dlb-cell-note">
                Offline, refusing events, or suspended by an operator.
              </p>
            </div>

            <div className="dlb-cell">
              <p className="dlb-cell-label">Quarantine on the record</p>
              <p className="dlb-cell-value">
                <span className="dlb-tallyfig">{figure(d.quarantines.length)}</span>
                <span className="dlb-of"> of {figure(d.total)}</span>
              </p>
              <p className="dlb-cell-note">
                Sources that reported at least one refused event. One that reported no counter at
                all is not in this figure.
              </p>
            </div>

            <div className="dlb-cell">
              <p className="dlb-cell-label">Outbox not measured</p>
              <p className="dlb-cell-value">
                <span className="dlb-tallyfig">{figure(d.unmeasured)}</span>
                <span className="dlb-of"> of {figure(d.total)}</span>
              </p>
              <p className="dlb-cell-note">
                Connected sources that reported no usable outbox measurement. Not a zero, and never
                ranked as one.
              </p>
            </div>
          </div>
        </section>

        {/* --- 3. heartbeats --- */}
        <section className="dlb-section" aria-labelledby="dlb-heartbeats-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-heartbeats-heading">
              Recent heartbeats
            </h2>
            <p className="dlb-sectionnote">
              Most recent first, at most {figure(RECENT_LIMIT)} rows. Never heard from is a
              different fact from an old heartbeat and is not shown as one.
            </p>
          </div>

          {d.heartbeats.length === 0 ? (
            <div className="dlb-hero">
              <Empty
                title="No heartbeat has ever been accepted from a source in this account"
                detail="Every installation here is still waiting for its first one. That is the state a source sits in between being registered and being activated on the machine it runs on, and it is not a fault."
              />
            </div>
          ) : (
            <Table columns="heartbeats" heads={["Source", "Last heartbeat (UTC)", "Freshness"]}>
              {d.heartbeats.map((source) => {
                const last = instant(source.row.last_heartbeat_at);
                const age = ageSince(source.row.last_heartbeat_at, now);
                return (
                  <article className="dlb-row" data-static="true" key={source.row.source_id}>
                    <SourceCell source={source} />
                    <div className="dlb-rowcell">
                      <span className="dlb-rowlabel">Last heartbeat (UTC)</span>
                      <Value reading={last} />
                    </div>
                    <div className="dlb-rowcell">
                      <span className="dlb-rowlabel">Freshness</span>
                      {/* The word and its shape first, then the measurement that produced it. */}
                      <StatusChip tone={source.heartbeatFresh ? "good" : "await"}>
                        {source.heartbeatFresh ? "Fresh" : "Stale"}
                      </StatusChip>
                      {age === null ? null : <p className="dlb-rownote">{age}</p>}
                    </div>
                  </article>
                );
              })}
            </Table>
          )}

          <TableNote>
            {absenceNote(
              d.total,
              d.heartbeats,
              (absent) =>
                `${figure(absent)} ${plural(absent, "source is", "sources are")} absent from this table because ${plural(absent, "it has", "they have")} never been heard from at all.`,
            )}
          </TableNote>
        </section>

        {/* --- 4. ingestion verifications --- */}
        <section className="dlb-section" aria-labelledby="dlb-verifications-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-verifications-heading">
              Recent ingestion verifications
            </h2>
            <p className="dlb-sectionnote">
              A heartbeat says the installation can reach us. Only this says its data lands. A
              source never verified is an absent proof rather than a failed one, so it is left off
              the table instead of entered as a zero.
            </p>
          </div>

          {d.verifications.length === 0 ? (
            <div className="dlb-hero">
              <Empty
                title="No source in this account has proved that an event reaches storage"
                detail="Ingestion is verified when a diagnostic event sent by the installation is found in storage. Until one is, a connected source has shown that it can reach us and nothing more."
              />
            </div>
          ) : (
            <Table columns="verifications" heads={["Source", "Verified (UTC)", "Age"]}>
              {d.verifications.map((source) => {
                const at = instant(source.row.ingestion_verified_at, "Never verified");
                const age = ageSince(source.row.ingestion_verified_at, now);
                return (
                  <article className="dlb-row" data-static="true" key={source.row.source_id}>
                    <SourceCell source={source} />
                    <div className="dlb-rowcell">
                      <span className="dlb-rowlabel">Verified (UTC)</span>
                      <Value reading={at} />
                    </div>
                    <div className="dlb-rowcell">
                      <span className="dlb-rowlabel">Age</span>
                      <Value reading={reported(age)} />
                    </div>
                  </article>
                );
              })}
            </Table>
          )}

          <TableNote>
            {absenceNote(
              d.total,
              d.verifications,
              (absent) =>
                `${figure(absent)} ${plural(absent, "source has", "sources have")} never been verified.`,
            )}
          </TableNote>
        </section>

        {/* --- 5. queue pressure --- */}
        <section className="dlb-section" aria-labelledby="dlb-queues-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-queues-heading">
              Queue pressure
            </h2>
            <p className="dlb-sectionnote">
              The outbox each installation is holding, against the ceiling it was configured with,
              fullest first. A fill is shown only where both numbers were reported.
            </p>
          </div>

          {d.pressure.length === 0 ? (
            <div className="dlb-hero">
              <Empty
                title="No outbox measurement has been reported by a source in this account"
                detail="Nothing here is at zero. Nothing here has been measured. Queue figures ride on the heartbeat and every field of it is optional, so an installation that cannot measure its outbox still reports that it is alive."
              />
            </div>
          ) : (
            <Table columns="queues" heads={["Source", "Used", "Ceiling", "Fill", "Events held"]}>
              {d.pressure.map((source) => (
                <article className="dlb-row" data-static="true" key={source.row.source_id}>
                  <SourceCell source={source} />
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Used</span>
                    <Value reading={bytes(source.row.queue_bytes_used)} />
                  </div>
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Ceiling</span>
                    <Value reading={bytes(source.row.queue_bytes_ceiling)} />
                  </div>
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Fill</span>
                    {/*
                     * The ratio, and only where both numbers exist. `queueFill`
                     * returns null otherwise, so this is the word and the
                     * neutral bar rather than a confident nought per cent.
                     */}
                    <Value reading={percent(source.queueFillPercent)} />
                  </div>
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Events held</span>
                    <Value reading={count(source.row.queue_event_count)} />
                  </div>
                </article>
              ))}
            </Table>
          )}

          <TableNote>
            {d.unmeasured === 0
              ? null
              : `${figure(d.unmeasured)} connected ${plural(d.unmeasured, "source", "sources")} reported no usable outbox measurement, so ${plural(d.unmeasured, "it is", "they are")} left out of the ranking rather than placed at the bottom of it.`}
          </TableNote>
        </section>

        {/* --- 6. quarantine --- */}
        <section className="dlb-section" aria-labelledby="dlb-quarantine-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-quarantine-heading">
              Quarantine activity
            </h2>
            <p className="dlb-sectionnote">
              Events this account is not counting. Local quarantine is what the installation refused
              to send; backend quarantine is what we refused to accept, and the two have different
              fixes.
            </p>
          </div>

          {d.quarantines.length === 0 ? (
            <div className="dlb-hero">
              <Empty
                title="No source in this account has reported a quarantined event"
                detail="Either nothing has been refused, or no installation has reported a quarantine count yet. The two cannot be told apart here, and an unreported counter is not evidence of a clean estate."
              />
            </div>
          ) : (
            <Table
              columns="quarantine"
              heads={[
                "Source",
                "Local quarantine",
                "Backend quarantine",
                "Validation failures",
                "Capacity refusals",
              ]}
            >
              {d.quarantines.map((source) => (
                <article className="dlb-row" data-static="true" key={source.row.source_id}>
                  <SourceCell source={source} />
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Local quarantine</span>
                    <Value reading={count(source.row.quarantine_count)} />
                  </div>
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Backend quarantine</span>
                    <Value reading={count(source.row.backend_quarantine_count)} />
                  </div>
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Validation failures</span>
                    <Value reading={count(source.row.validation_failure_count)} />
                  </div>
                  <div className="dlb-rowcell">
                    <span className="dlb-rowlabel">Capacity refusals</span>
                    <Value reading={count(source.row.capacity_refusal_count)} />
                  </div>
                </article>
              ))}
            </Table>
          )}

          <TableNote>
            {d.quarantines.length === 0
              ? null
              : "Only counts that were actually reported. A source whose counters are all absent is not on this table, because it has not reported an empty quarantine."}
          </TableNote>
        </section>

        {/* --- 7. error codes --- */}
        <section className="dlb-section" aria-labelledby="dlb-errors-heading">
          <div className="dlb-sectionhead">
            <h2 className="dlb-h2" id="dlb-errors-heading">
              Recent safe error codes
            </h2>
            <p className="dlb-sectionnote">
              The last code each installation reported, most recently seen first. A code and never a
              message: the column is bounded so an exception body can never arrive in an operational
              table.
            </p>
          </div>

          {d.errors.length === 0 ? (
            <div className="dlb-hero">
              <Empty
                title="No source in this account has reported an error code"
                detail="The heartbeat carries at most one short code, and none of the installations here has sent one. There is no message behind this, because the field cannot hold one."
              />
            </div>
          ) : (
            <Table columns="errors" heads={["Source", "Code", "Last seen (UTC)"]}>
              {d.errors.map((source) => {
                const code = reported(source.row.last_error_code);
                return (
                  <article className="dlb-row" data-static="true" key={source.row.source_id}>
                    <SourceCell source={source} />
                    <div className="dlb-rowcell">
                      <span className="dlb-rowlabel">Code</span>
                      {code.missing ? (
                        <Value reading={code} />
                      ) : (
                        <span className="dlb-codeword">{code.text}</span>
                      )}
                    </div>
                    <div className="dlb-rowcell">
                      <span className="dlb-rowlabel">Last seen (UTC)</span>
                      <Value reading={instant(source.row.last_seen_at)} />
                    </div>
                  </article>
                );
              })}
            </Table>
          )}
        </section>
      </div>

      <footer className="dlb-foot">
        <div className="dlb-width dlb-foot-inner">
          <span>Design lab / {screenName} / Variant B</span>
          <span>{variantName}</span>
        </div>
      </footer>
    </div>
  );
}
