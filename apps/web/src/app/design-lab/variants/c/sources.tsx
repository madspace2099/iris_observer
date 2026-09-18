import { StatusChip, StatusMark } from "@/components/madspace/StatusMark";
import type { Reading } from "@/lib/madspace/format";

import type { LabScreenProps } from "../../lab-data";
import { labSourceRows, type LabSourceRow } from "../../lab-fields";

/**
 * VARIANT C, SOURCES. HYBRID EXECUTIVE.
 *
 * The same frame as the rest of this direction: graphite holds what we CONCLUDE
 * and what a person may DO; the paper plate holds what was MEASURED. Here the
 * conclusion is one sentence about the account's machines, and the measurement
 * is one ruled entry per machine.
 *
 * ## The exception is lifted out of the list
 *
 * This is the direction's disagreement with the other two. Variant A orders the
 * rows worst-first and Variant B groups them by project; both leave the reader
 * to find the important row by scanning. This one takes the rows that want an
 * operator OUT of the list and states them above it, on graphite, in words —
 * and then prints every machine below, in the calm order a register should be
 * in: by project, then by name.
 *
 * The argument is that an estate list is read for two different reasons on two
 * different days. "What is broken this morning" is a question with one or two
 * answers and deserves prose. "Where is the Riverside staging box" is a lookup
 * and deserves alphabetical order. Serving both from one sorted column means
 * the lookup is re-sorted every time something breaks, which is the version of
 * this screen that ages worst as the estate grows.
 *
 * ## Restraint is the point
 *
 * Fewer figures per entry than A carries, deliberately. The three states, the
 * verdict, the heartbeat, and the queue only where there IS one. Everything
 * else a machine knows is one click away on its own screen, and an entry that
 * prints eleven fields is an entry nobody reads to the end.
 *
 * What is not sacrificed to that restraint: the three states are three states,
 * each with its own word. A condensed row is still not allowed to become a
 * health dot.
 */
export function SourcesC({ estate, screenName, variantName }: LabScreenProps) {
  void screenName;
  const rows = labSourceRows(estate.estate, estate.now);
  const wanting = rows.filter((row) => row.attention !== null);
  const register = [...rows].sort(
    (left, right) =>
      NAMES.compare(left.project, right.project) || NAMES.compare(left.name, right.name),
  );
  const silent = rows.filter((row) => row.health === "never_connected").length;

  return (
    <div className="dlc-root dlc-graphite">
      <a className="dlc-skip" href="#dlc-work">
        Skip to the installations
      </a>

      <div className="dlc-frame">
        <div className="dlc-rail">
          <p className="dlc-rail-mark">
            IRIS Observer <span>MADSPACE operations</span>
          </p>
          <p className="dlc-rail-lab">Design lab &middot; Variant C &middot; {variantName}</p>
        </div>

        <header>
          <div className="dlc-mast-grid">
            <div className="dlc-mast-text">
              <p className="dlc-kicker">Estate</p>
              <h1 className="dlc-title">Sources</h1>
              <p className="dlc-answer">{answer(rows.length, wanting.length, silent)}</p>

              {/*
               * The verdict slot, and what stands in it here. An account's
               * machines do not share a state — one is offline and nine have
               * never spoken — so a single chip would be an average of things
               * that are not comparable. The slot keeps its place and says what
               * it is not.
               */}
              <div className="dlc-verdict">
                <span className="dlc-verdict-note">
                  There is no one state for an account. Every state on this screen belongs to a
                  machine and is drawn on the entry that owns it.
                </span>
              </div>
            </div>

            <div className="dlc-controls">
              <p className="dlc-controls-label">Nothing is created here</p>
              <p className="dlc-controls-note">
                A source is created inside its project and activated from the machine itself. This
                screen reads them.
              </p>
            </div>
          </div>
        </header>

        {/*
         * The exception, above the register and on graphite: this is a
         * conclusion, not a measurement, so it belongs on the dark ground with
         * the rest of what we conclude.
         */}
        <section className="dlc-region" aria-labelledby="dlc-wants">
          <div className="dlc-region-head">
            <h2 id="dlc-wants">What wants an operator</h2>
            <p className="dlc-lede">
              Lifted out of the register rather than sorted to the top of it, so the list below can
              stay in the order somebody looking for a particular machine would expect. An
              installation nobody has reached yet is not here: it is waiting on a first heartbeat
              rather than on a person, and calling that a fault would put nine rows in this section
              on the day an account is set up.
            </p>
          </div>

          {wanting.length === 0 ? (
            <div className="dlc-empty">
              <p className="dlc-empty-title">Nothing is waiting on a person</p>
              <p className="dlc-empty-note">
                No installation is offline, refusing events or switched off. That is not the same as
                every machine delivering — the register below says which have proved an event
                reaches storage.
              </p>
            </div>
          ) : (
            <ul className="dlc-exceptions">
              {wanting.map((row) => (
                <li key={row.id} className="dlc-exception">
                  <p className="dlc-exception-head">
                    <StatusMark tone={row.healthTone} />
                    <span className="dlc-exception-name">{row.name}</span>
                    <span className="dlc-micro">{row.project}</span>
                  </p>
                  <p className="dlc-exception-why">
                    <span className="dlc-exception-verdict">{row.healthLabel}.</span>{" "}
                    {row.attention}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dlc-region" aria-labelledby="dlc-work">
          <div className="dlc-region-head">
            <h2 id="dlc-work">The register</h2>
            <p className="dlc-lede">
              Every installation in the account, by project and then by name — the order a lookup
              wants, and one that does not rearrange itself when something breaks. Each entry
              carries activation, connection and ingestion as three readings, because all four
              combinations occur and a machine that is connected and has never delivered is the
              state this product exists to show.
            </p>
          </div>

          <div className="dlc-plate dlc-paper">
            {register.length === 0 ? (
              <div className="dlc-empty">
                <p className="dlc-empty-title">This account holds no installations</p>
                <p className="dlc-empty-note">
                  A project with no sources still appears on Projects, so an empty register means no
                  machine has been created anywhere in the account.
                </p>
              </div>
            ) : (
              <div className="dlc-list">
                {register.map((row) => (
                  <SourceEntry key={row.id} row={row} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="dlc-foot">
        <p>
          Development instrument. Every installation in the account, read through the same control
          plane the live screens read. Every control is drawn and inert.
        </p>
      </div>
    </div>
  );
}

/* --- the sentence ------------------------------------------------------------------- */

const PLURALS = new Intl.PluralRules("en-GB");
const NAMES = new Intl.Collator("en-GB");

function plural(value: number, one: string, other: string): string {
  return PLURALS.select(value) === "one" ? one : other;
}

/**
 * The account's machines in one sentence, and it names the silence.
 *
 * Nine of ten never heard from is the loudest fact in this estate and the
 * easiest one to leave out of a summary, because it is not a failure and does
 * not appear in any error count. A sentence that said "one needs attention" and
 * stopped would be true and would leave the reader with the wrong estate in
 * their head.
 */
function answer(total: number, wanting: number, silent: number): string {
  if (total === 0) return "This account holds no installations yet.";

  const scale = `${String(total)} ${plural(total, "installation", "installations")}`;
  const first =
    wanting === 0
      ? `${scale}, and none is waiting on a person.`
      : `${scale}. ${String(wanting)} ${plural(wanting, "is", "are")} waiting on a person.`;

  if (silent === 0) return first;
  return (
    `${first} ${String(silent)} ${plural(silent, "has", "have")} never been heard from at all, ` +
    `which is a machine nobody has switched on rather than a fault.`
  );
}

/* --- a value, and the absence of one ------------------------------------------------ */

function Value({ reading }: { reading: Reading }) {
  if (!reading.missing) return <span className="dlc-value">{reading.text}</span>;

  return (
    <span className="dlc-value" data-missing="true">
      <StatusMark tone="none" />
      <span>{reading.text}</span>
    </span>
  );
}

/* --- one entry ---------------------------------------------------------------------- */

function SourceEntry({ row }: { row: LabSourceRow }) {
  return (
    <article className="dlc-row" data-shape="installation">
      <div className="dlc-row-id">
        <p className="dlc-micro">{row.project}</p>
        <h3 className="dlc-row-name">{row.name}</h3>
        <div className="dlc-row-chips">
          <span className="dlc-micro">{row.type}</span>
          <span className="dlc-micro">{row.environment}</span>
          <StatusChip tone={row.healthTone}>{row.healthLabel}</StatusChip>
        </div>
      </div>

      {/*
       * THE THREE READINGS, STACKED — and this is the direction's answer rather
       * than a compromise.
       *
       * Project detail sets them three across as chips, which works when one
       * machine owns the width. In a register of ten they were three chips in
       * a nineteen-rem column and "Awaiting first heartbeat" came out as
       * "Awaiting first heartbe". A clipped state word is the exact failure
       * this product refuses everywhere else, and widening the column would
       * have spent the register's whitespace — this direction's whole argument
       * — on repeating three labels ten times.
       *
       * So they stack: label, mark, word, one line each. It is more restrained
       * than a chip row, which suits the direction, and no word can be cut.
       */}
      <dl className="dlc-readings">
        {row.states.map((cell) => (
          <div key={cell.key}>
            <dt>{cell.column}</dt>
            <dd>
              <StatusMark tone={cell.tone} />
              <span>{cell.word}</span>
            </dd>
          </div>
        ))}
      </dl>

      <dl className="dlc-when">
        <div>
          <dt>Last heartbeat</dt>
          <dd>
            <Value reading={row.heartbeat} />
            {row.heartbeatAge === null ? null : <span className="dlc-age">{row.heartbeatAge}</span>}
          </dd>
        </div>
        {/*
         * The queue only where there is one. An entry that printed "0 pending"
         * on nine machines that have never run would spend a line on a number
         * that means nothing, and this direction spends its lines carefully.
         */}
        {row.pendingEvents.missing ? null : (
          <div>
            <dt>Pending events</dt>
            <dd>
              <Value reading={row.pendingEvents} />
              {row.oldestPending.missing ? null : (
                <span className="dlc-age">oldest {row.oldestPending.text}</span>
              )}
            </dd>
          </div>
        )}
        {row.quarantineUnmeasured ? null : (
          <div>
            <dt>Quarantine</dt>
            <dd>
              <Value reading={row.quarantine} />
              <span className="dlc-age">local</span>
              <Value reading={row.backendQuarantine} />
              <span className="dlc-age">backend</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="dlc-row-go">
        <button className="dlc-btn" data-kind="tertiary" type="button">
          Open source
        </button>
      </div>
    </article>
  );
}
