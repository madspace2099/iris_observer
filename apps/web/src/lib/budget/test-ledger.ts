import "server-only";

import type {
  AccountUsage,
  DispatchOutcome,
  Ledger,
  Period,
  ReleaseOutcome,
  Reservation,
  ReservationStatus,
  ReserveOutcome,
} from "./ledger";

/**
 * THE BROWSER SUITE'S USAGE LEDGER. NOT A DEVELOPMENT CONVENIENCE.
 *
 * The credential harness's twin, and answerable to the same four conditions
 * through the same predicate — one gate, so a server that can hold a test
 * credential can hold a test ledger and no other server can hold either.
 * Isolated here for the same reason: everything about it, including the
 * `globalThis` backing, is in one file that gets deleted in one piece.
 *
 * ## Atomicity without a database
 *
 * The real ledger lets PostgreSQL decide in one statement. This one has no
 * transaction, so `reserve` is written as a synchronous read-check-write with
 * **no `await` between reading the balance and writing the hold**. JavaScript
 * runs one turn at a time, so nothing can interleave inside that stretch, and
 * two concurrent reservations cannot both see room only one of them can have.
 *
 * That property is fragile by nature — one stray `await` in the middle would
 * silently destroy it — so the sequence is marked, and a test fires many
 * reservations at once and asserts the budget held.
 */

const BACKING = Symbol.for("observer.budget.test-ledger");

/** A hold and where it is in its life. See `ledger.ts` for the states. */
interface Held {
  readonly reservation: Reservation;
  readonly status: ReservationStatus;
}

interface Row extends AccountUsage {
  readonly reservations: Map<string, Held>;
}

interface Backing {
  readonly rows: Map<string, Row>;
}

function backing(): Backing {
  const host = globalThis as unknown as Record<symbol, Backing | undefined>;
  const existing = host[BACKING];
  if (existing !== undefined) return existing;
  const created: Backing = { rows: new Map() };
  host[BACKING] = created;
  return created;
}

function key(accountId: string, period: Period): string {
  return `${accountId}::${period}`;
}

/**
 * The ceiling this account most recently chose, for a period with no row.
 *
 * Mirrors the fallback in `observer_usage_read` and `observer_usage_reserve`.
 * Periods are `YYYY-MM`, so the lexicographic maximum is the latest month.
 */
function carriedBudget(accountId: string): number {
  let latest: Row | null = null;
  for (const row of backing().rows.values()) {
    if (row.accountId !== accountId) continue;
    if (latest === null || row.period > latest.period) latest = row;
  }
  return latest?.budgetMicros ?? 0;
}

function rowFor(accountId: string, period: Period): Row {
  const store = backing();
  const existing = store.rows.get(key(accountId, period));
  if (existing !== undefined) return existing;

  const created: Row = {
    accountId,
    period,
    budgetMicros: carriedBudget(accountId),
    spentMicros: 0,
    reservedMicros: 0,
    uncertainMicros: 0,
    requests: 0,
    reservations: new Map(),
  };
  store.rows.set(key(accountId, period), created);
  return created;
}

/** The row as the port reports it: everything but the reservations map. */
function usageOf(row: Row): AccountUsage {
  return {
    accountId: row.accountId,
    period: row.period,
    budgetMicros: row.budgetMicros,
    spentMicros: row.spentMicros,
    reservedMicros: row.reservedMicros,
    uncertainMicros: row.uncertainMicros,
    requests: row.requests,
  };
}

function replace(row: Row, changes: Partial<AccountUsage>): void {
  backing().rows.set(key(row.accountId, row.period), { ...row, ...changes });
}

/** Where a hold lives, so the lifecycle calls can find it by id alone. */
function findHeld(id: string): { row: Row; held: Held } | null {
  for (const row of backing().rows.values()) {
    const held = row.reservations.get(id);
    if (held !== undefined) return { row, held };
  }
  return null;
}

export function testLedger(): Ledger {
  return {
    kind: "test",

    usage: (accountId, period) => Promise.resolve(usageOf(rowFor(accountId, period))),

    setBudget: (accountId, period, budgetMicros) => {
      replace(rowFor(accountId, period), { budgetMicros });
      return Promise.resolve();
    },

    reserve: (reservation) => {
      /*
       * ── THE ATOMIC STRETCH ── no `await` from here to the write below.
       *
       * Read the balance, decide, and record the hold in one synchronous run.
       * An `await` inserted anywhere in this block hands control back to the
       * event loop between the check and the write, and two requests then both
       * pass a check that only one of them could satisfy.
       */
      const row = rowFor(reservation.accountId, reservation.period);

      if (row.budgetMicros <= 0) {
        return Promise.resolve({ ok: false, reason: "no_budget", usage: usageOf(row) });
      }

      const committed = row.spentMicros + row.reservedMicros;
      if (committed + reservation.amountMicros > row.budgetMicros) {
        return Promise.resolve({ ok: false, reason: "exhausted", usage: usageOf(row) });
      }

      row.reservations.set(reservation.id, { reservation, status: "reserved" });
      replace(row, { reservedMicros: row.reservedMicros + reservation.amountMicros });
      /* ── end of the atomic stretch ── */

      return Promise.resolve({ ok: true, reservation } satisfies ReserveOutcome);
    },

    /*
     * THE MOMENT THE MONEY STOPS BEING REFUNDABLE.
     *
     * Called immediately before the request leaves. Anything that fails after
     * this becomes uncertain rather than free, because the vendor may already
     * have done the work.
     */
    dispatch: (reservationId) => {
      const found = findHeld(reservationId);
      if (found === null) return Promise.resolve("unknown" satisfies DispatchOutcome);

      const { row, held } = found;
      if (held.status === "uncertain")
        return Promise.resolve("uncertain" satisfies DispatchOutcome);

      row.reservations.set(reservationId, { reservation: held.reservation, status: "dispatched" });
      return Promise.resolve("dispatched" satisfies DispatchOutcome);
    },

    settle: (reservationId, actualMicros) => {
      const found = findHeld(reservationId);
      /* Idempotent: a second settle for the same id is a no-op, not a charge. */
      if (found === null) return Promise.resolve();

      const { row, held } = found;
      const amount = held.reservation.amountMicros;
      row.reservations.delete(reservationId);

      /*
       * An uncertain hold has already moved its money into `spent`. Settling it
       * later — because somebody reconciled the vendor's invoice — corrects that
       * charge rather than adding a second one.
       */
      if (held.status === "uncertain") {
        replace(row, {
          spentMicros: Math.max(0, row.spentMicros - amount) + Math.max(0, actualMicros),
          uncertainMicros: Math.max(0, row.uncertainMicros - amount),
          requests: row.requests + 1,
        });
        return Promise.resolve();
      }

      replace(row, {
        reservedMicros: Math.max(0, row.reservedMicros - amount),
        spentMicros: row.spentMicros + Math.max(0, actualMicros),
        requests: row.requests + 1,
      });
      return Promise.resolve();
    },

    /*
     * A REFUND IS ONLY FOR A REQUEST THAT WAS NEVER SENT.
     *
     * A dispatched hold is refused here however the caller asks. "We never
     * heard back" is not evidence that nothing happened, and handing back
     * headroom that a completed request already consumed is the one arithmetic
     * error a budget must not make.
     */
    release: (reservationId) => {
      const found = findHeld(reservationId);
      if (found === null) return Promise.resolve("unknown" satisfies ReleaseOutcome);

      const { row, held } = found;
      if (held.status !== "reserved") {
        return Promise.resolve(held.status satisfies ReleaseOutcome);
      }

      row.reservations.delete(reservationId);
      replace(row, {
        reservedMicros: Math.max(0, row.reservedMicros - held.reservation.amountMicros),
      });
      return Promise.resolve("released" satisfies ReleaseOutcome);
    },

    /** Charges a dispatched hold in full and flags it as unconfirmed. */
    markUncertain: (reservationId) => {
      const found = findHeld(reservationId);
      if (found === null || found.held.status !== "dispatched") {
        return Promise.resolve("unknown" as const);
      }

      const { row, held } = found;
      const amount = held.reservation.amountMicros;
      row.reservations.set(reservationId, { reservation: held.reservation, status: "uncertain" });
      replace(row, {
        reservedMicros: Math.max(0, row.reservedMicros - amount),
        spentMicros: row.spentMicros + amount,
        uncertainMicros: row.uncertainMicros + amount,
      });
      return Promise.resolve("uncertain" as const);
    },

    expire: (now) => {
      /*
       * A hold nobody resolved would consume a budget forever. The process that
       * made it may have died mid-request, which is exactly when a reader most
       * needs the arithmetic to be right.
       *
       * And "right" depends on whether anything was sent. An expired RESERVED
       * hold never reached a vendor, so the money comes back in full. An expired
       * DISPATCHED one may have been completed and billed, so it is charged and
       * flagged uncertain instead. Treating both as refunds is how a budget
       * quietly stops being a budget.
       */
      let reclaimed = 0;
      for (const snapshot of [...backing().rows.values()]) {
        for (const [id, held] of [...snapshot.reservations]) {
          if (held.reservation.expiresAt > now) continue;
          if (held.status === "uncertain") continue;

          const amount = held.reservation.amountMicros;
          const current = backing().rows.get(key(snapshot.accountId, snapshot.period));
          if (current === undefined) continue;

          if (held.status === "reserved") {
            current.reservations.delete(id);
            replace(current, {
              reservedMicros: Math.max(0, current.reservedMicros - amount),
            });
          } else {
            current.reservations.set(id, { reservation: held.reservation, status: "uncertain" });
            replace(current, {
              reservedMicros: Math.max(0, current.reservedMicros - amount),
              spentMicros: current.spentMicros + amount,
              uncertainMicros: current.uncertainMicros + amount,
            });
          }
          reclaimed += 1;
        }
      }
      return Promise.resolve(reclaimed);
    },
  };
}

/** Wipes the harness ledger. For test setup only. */
export function resetTestLedger(): void {
  backing().rows.clear();
}
