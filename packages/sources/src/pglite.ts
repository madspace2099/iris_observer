import type {
  ActivationConsumeRow,
  CredentialResolveRow,
  CredentialStatusRow,
  EventAppendRow,
  FacadeName,
  ObserverDb,
  SourceOperationsRow,
  SourceStatusRow,
  StoredEventRow,
} from "./db";

/**
 * The {@link ObserverDb} implementation that speaks SQL to a Postgres directly.
 *
 * ## Why this takes a query function and not a `PGlite`
 *
 * `@electric-sql/pglite` is a **root devDependency**. It is a Postgres compiled
 * to WASM, weighs a quarter of a gigabyte at run time, and exists in this
 * repository so migrations can be executed in a test. Importing it here would
 * make `@observer/sources` — a package whose whole claim is that it is free of
 * Next.js, Supabase and HTTP — depend on a test tool, and would drag that WASM
 * into whatever bundles the ingestion boundary.
 *
 * So the seam is one function:
 *
 *     (sql, params) => Promise<{ rows: unknown[] }>
 *
 * which is the intersection of what PGlite's `query`, `pg`'s `Client.query` and
 * `postgres.js`'s tagged form all already are. The test writes
 * `(sql, params) => db.query(sql, [...params])` and that is the entire binding.
 *
 * The second reason is worth stating separately because it is the one that will
 * matter later: nothing below knows it is talking to PGlite. Pointing this
 * adapter at a real node-postgres pool — a migration runner, a background job,
 * a `DATABASE_URL` that finally exists — is a change to the caller and not a
 * rewrite of the adapter. `postgrestDb()` is the other implementation because
 * PostgREST is *not* SQL-shaped; anything that is, uses this.
 *
 * ## One statement per method, and no value ever reaches the SQL text
 *
 * Every method issues exactly one `select ... public.observer_<name>($1, ...)`
 * with positional parameters. That is not a style preference: the port promises
 * one round trip per method because that is all PostgREST can express, and a
 * method that quietly issued two here would be honest against PGlite and a lie
 * against the deployment the local proof is supposed to stand in for.
 *
 * Values are always parameters. The only things this file ever puts into SQL
 * text are a facade name from {@link FacadeName} and a `$n` list, neither of
 * which a caller can influence.
 *
 * ## Why there is no validation of what comes back
 *
 * Every row below is cast rather than parsed, and that is deliberate. The other
 * end of each call is our own `security definer` facade with a fixed
 * `returns table (...)` in a migration this repository executes on every test
 * run. Re-checking those column names and types here would not be validating
 * untrusted input; it would be asserting that PostgreSQL honours its own
 * function signature, which is a test of Postgres and not of us — and it would
 * put a second, silently drifting copy of every row shape in the codebase.
 *
 * What *is* checked is the two things a mistake in this file could actually
 * cause: that a scalar facade returned a row at all, and that the argument list
 * written beside each call names as many parameters as were passed.
 */

/**
 * The whole dependency this adapter has on a database driver.
 *
 * `rows` is `unknown[]` rather than a generic because the caller has no useful
 * type to supply — each facade returns its own shape, and this file already
 * knows which. Anything wider (fields, affected rows, a command tag) is left
 * out: a port that could see them would grow a method that used them.
 */
export type SqlQuery = (sql: string, params: readonly unknown[]) => Promise<{ rows: unknown[] }>;

/**
 * The written argument list and the supplied parameters must agree.
 *
 * ## Why the lists are written out rather than generated from `params.length`
 *
 * For eleven of the fourteen facades `$1, $2, $3` could be derived and would be
 * identical. Two of them cannot be — `observer_events_append` and
 * `observer_heartbeat_record` take a `jsonb` whose cast has to live in the SQL
 * text, because the value crossing the wire is a string and only the statement
 * can say what it is meant to become.
 *
 * Having written them out, the port's own warning applies: the argument lists
 * are load-bearing, and a reviewer diffing this file against a migration is
 * reading two things that can drift. This catches the one way they drift that
 * TypeScript cannot see — a parameter added to the array and not to the list,
 * or the reverse, which Postgres would report as a missing `$4` or an ignored
 * value rather than as the wrong function being called.
 */
function assertArity(name: FacadeName, args: string, params: readonly unknown[]): void {
  const written = args.match(/\$\d+/g)?.length ?? 0;
  if (written !== params.length) {
    throw new Error(
      `${name}: the argument list names ${String(written)} parameter(s), ` +
        `but ${String(params.length)} were supplied`,
    );
  }
}

/** A facade declared `returns table (...)`, read as rows. */
async function callTable(
  query: SqlQuery,
  name: FacadeName,
  args: string,
  params: readonly unknown[],
): Promise<readonly unknown[]> {
  assertArity(name, args, params);
  const result = await query(`select * from public.${name}(${args})`, params);
  return result.rows;
}

/**
 * A facade declared `returns uuid` or `returns boolean`, read as one value.
 *
 * The alias is what makes the result addressable: without `as value` the column
 * is named after the function, so every call site would have to know its own
 * facade's name twice, or reach in by position.
 */
async function callScalar<T>(
  query: SqlQuery,
  name: FacadeName,
  args: string,
  params: readonly unknown[],
): Promise<T> {
  assertArity(name, args, params);
  const result = await query(`select public.${name}(${args}) as value`, params);
  const row = result.rows[0];
  if (row === undefined) {
    /*
     * Unreachable against a correct facade — a scalar function in a select list
     * yields exactly one row, even when its body matched nothing, in which case
     * the value is SQL NULL. This exists because `noUncheckedIndexedAccess`
     * requires an answer, and an explicit throw beats a cast that would hand
     * the caller `undefined` typed as a uuid.
     */
    throw new Error(`${name} returned no row, which a scalar function cannot do`);
  }
  return (row as { readonly value: T }).value;
}

/**
 * The first row, or null — never a throw.
 *
 * Zero rows is an *outcome* for the three facades that use this, not a failure:
 * an activation code that does not verify, a credential selector nobody issued,
 * a source that has never held a credential. Throwing would make the caller
 * distinguish those from a real database error, and `activationConsume`'s whole
 * design is that every failure is the same failure.
 */
function firstRow<T>(rows: readonly unknown[]): T | null {
  const row = rows[0];
  return row === undefined ? null : (row as T);
}

/**
 * Bind the port to a Postgres reachable through `query`.
 *
 * The returned object is stateless and holds nothing but the function it was
 * given, so it is safe to build one per request or one per process.
 */
export function pgliteDb(query: SqlQuery): ObserverDb {
  return {
    /* --- control plane ---------------------------------------------------- */

    projectCreate: (input) =>
      callScalar<string>(query, "observer_project_create", "$1, $2, $3", [
        input.account,
        input.name,
        input.slug,
      ]),

    sourceCreate: (input) =>
      callScalar<string>(query, "observer_source_create", "$1, $2, $3, $4, $5", [
        input.account,
        input.project,
        input.type,
        input.environment,
        input.label,
      ]),

    sourceSetState: (input) =>
      callScalar<boolean>(query, "observer_source_set_state", "$1, $2, $3", [
        input.account,
        input.source,
        input.state,
      ]),

    sourceStatus: async (input) =>
      (await callTable(query, "observer_source_status", "$1, $2", [
        input.account,
        input.project,
      ])) as readonly SourceStatusRow[],

    /* --- activation ------------------------------------------------------- */

    activationIssue: (input) =>
      callScalar<boolean>(query, "observer_activation_issue", "$1, $2, $3, $4, $5, $6", [
        input.account,
        input.source,
        input.selector,
        input.verifier,
        input.purpose,
        input.expiresAt,
      ]),

    /*
     * FOUR SECRET-DERIVED STRINGS IN A FIXED ORDER, and this is the call the
     * port's docblock is warning about. Swapping the code verifier with the
     * credential verifier type-checks perfectly and mints a credential whose
     * stored verifier no caller can ever present — an activation that reports
     * success and produces a source that can never authenticate.
     *
     * The order is: the code being spent (selector, verifier), then the
     * credential being minted (selector, verifier), then that credential's
     * expiry. Compare against `observer_activation_consume` before changing it.
     */
    activationConsume: async (input) =>
      firstRow<ActivationConsumeRow>(
        await callTable(query, "observer_activation_consume", "$1, $2, $3, $4, $5", [
          input.codeSelector,
          input.codeVerifier,
          input.credentialSelector,
          input.credentialVerifier,
          input.credentialExpiresAt,
        ]),
      ),

    credentialResolve: async (selector) =>
      firstRow<CredentialResolveRow>(
        await callTable(query, "observer_credential_resolve", "$1", [selector]),
      ),

    credentialRevoke: (input) =>
      callScalar<boolean>(query, "observer_credential_revoke", "$1, $2", [
        input.account,
        input.source,
      ]),

    /*
     * The facade is `order by c.created_at desc` and returns every credential a
     * source has ever held, including superseded ones. The port asks for one
     * row, so the newest is the answer and the history is dropped here rather
     * than filtered in SQL — an operator screen showing "the credential" means
     * the current one, and the rotation history is a different question with a
     * different shape.
     */
    credentialStatus: async (input) =>
      firstRow<CredentialStatusRow>(
        await callTable(query, "observer_credential_status", "$1, $2", [
          input.account,
          input.source,
        ]),
      ),

    /* --- ingestion -------------------------------------------------------- */

    /*
     * THE BATCH IS ONE PARAMETER, not one per event.
     *
     * A 200-event batch expanded into 200 placeholders would be 200 values the
     * planner has to bind, a statement whose text differs for every batch size
     * — so nothing in the chain can reuse a plan — and, at a large enough
     * batch, a collision with Postgres's 65535-parameter ceiling that would
     * arrive as a protocol error rather than as a rejected request. Sending one
     * `jsonb` keeps the statement identical for every batch and hands the
     * ordering problem to `with ordinality` inside the facade, which is the
     * only place it can be solved correctly.
     */
    eventsAppend: async (input) =>
      (await callTable(query, "observer_events_append", "$1, $2::jsonb", [
        input.source,
        JSON.stringify(input.events),
      ])) as readonly EventAppendRow[],

    eventsForSource: async (input) =>
      (await callTable(query, "observer_events_for_source", "$1, $2, $3", [
        input.account,
        input.source,
        input.limit,
      ])) as readonly StoredEventRow[],

    /* --- operations ------------------------------------------------------- */

    /*
     * The facts travel as one `jsonb` for the same reason the port nests them in
     * their own object rather than flattening them into the input: there are
     * fifteen of them, they are all optional, and four of them are adjacent
     * integers. As positional parameters, transposing `queue_bytes_used` and
     * `queue_bytes_ceiling` would type-check and would show an operator a
     * source permanently over its ceiling. As object keys they are named at
     * both ends, and a key the facade does not know is a null rather than a
     * silently misfiled number.
     */
    heartbeatRecord: (input) =>
      callScalar<boolean>(query, "observer_heartbeat_record", "$1, $2::jsonb", [
        input.source,
        JSON.stringify(input.facts),
      ]),

    ingestionVerified: (input) =>
      callScalar<boolean>(query, "observer_ingestion_verified", "$1", [input.source]),

    sourceOperations: async (input) =>
      (await callTable(query, "observer_source_operations", "$1, $2", [
        input.account,
        input.project,
      ])) as readonly SourceOperationsRow[],
  };
}
