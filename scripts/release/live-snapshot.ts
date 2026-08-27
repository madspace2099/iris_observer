/**
 * The one recorded observation of things this repository cannot recompute.
 *
 * Two kinds of fact live here, and neither can be derived from the working
 * tree: the state of the live Postgres, and the Vercel deployment inventory.
 * Every artefact that mentions a bucket age, an audit-row count or a deployed
 * SHA reads it from this object.
 *
 * That is the whole point. The previous package stated the oldest bucket was
 * 39 hours in one file, 47 in another and 48 in a third, because three
 * hand-edited documents each carried their own copy of a number that changes
 * every hour. A value repeated by hand is a value that will disagree with
 * itself; a value rendered from here cannot.
 *
 * Refreshing it is a deliberate act: run the read-only query in
 * `SNAPSHOT_QUERY` and replace the whole object, including `observedAt`. Never
 * edit one field.
 */

/** The exact read-only query that produced {@link LIVE}. Nothing here writes. */
export const SNAPSHOT_QUERY = `
with snap as (select now() as observed_at),
buckets as (
  select count(*)::int as n,
         floor(extract(epoch from (now() - min(window_start))) / 3600)::int as oldest_h,
         floor(extract(epoch from (now() - max(window_start))) / 3600)::int as newest_h
    from observer.ai_rate_buckets
),
audit as (
  select count(*)::int as n,
         count(*) filter (where audit_version = 1)::int as v1
    from observer.ai_requests
)
select * from snap, buckets, audit;
`.trim();

export interface LiveSnapshot {
  /** When the query ran, in the database's own clock, UTC. */
  readonly observedAt: string;
  readonly buckets: number;
  readonly oldestBucketHours: number;
  readonly newestBucketHours: number;
  readonly auditRows: number;
  readonly auditVersion1Rows: number;
  /** 1 once migration 3 has added `observer.ai_requests.pseudonym_version`. */
  readonly pseudonymVersionColumn: number;
  /** Argument count of `public.admit_ai_request`: 13 before migration 3, 15 after. */
  readonly admitArgs: number;
  /** 1 once migration 4 has created `observer.run_rate_bucket_retention`. */
  readonly retentionFunction: number;
  /** `consume_ai_quota` + `record_ai_request`: 2 until the contract migration. */
  readonly legacyFacades: number;
  /** 1 once pg_cron is installed. */
  readonly pgCron: number;
}

export const LIVE: LiveSnapshot = {
  observedAt: "2026-08-27 01:21:22.693002+00",
  buckets: 78,
  oldestBucketHours: 49,
  newestBucketHours: 29,
  auditRows: 133,
  auditVersion1Rows: 133,
  pseudonymVersionColumn: 0,
  admitArgs: 13,
  retentionFunction: 0,
  legacyFacades: 2,
  pgCron: 0,
};

/**
 * The threshold `observer.run_rate_bucket_retention` will enforce, in hours.
 *
 * Stated once so that "the oldest bucket has crossed the threshold" is a
 * COMPARISON rather than a sentence somebody has to keep true by hand.
 */
export const RETENTION_THRESHOLD_HOURS = 48;

/** Every bucket age observed in this series, oldest reading first. */
export const OLDEST_BUCKET_HISTORY: readonly number[] = [37, 38, 39, 44, 45, 47, 48, 49];

/**
 * THREE DIFFERENT FACTS, and the previous edition ran two of them together.
 *
 *   1. which bundles RECORD this inventory — {@link INVENTORY_RECORDED_IN};
 *   2. which bundle Vercel was last actually ENUMERATED for —
 *      {@link LAST_VERCEL_ENUMERATION};
 *   3. whether the inventory is CURRENT — unknowable from here, and stated as
 *      unknown wherever it matters.
 *
 * (1) and (2) were being conflated by taking the last entry of the list as the
 * enumeration point. That is wrong by construction: every bundle after an
 * enumeration also records the inventory, so the list grows every milestone
 * while the enumeration stays where it was. The package went on to say the
 * inventory was "last enumerated against Vercel for e18f860" when the last
 * enumeration was three bundles earlier.
 *
 * Bundles that carry the recording forward. NOT evidence of freshness:
 * consistency across bundles says the twenty deployments have been reported
 * identically, not that anybody looked again.
 * supabase/test/artefact-consistency.test.ts re-derives it from the delivered
 * archives when they are present, and skips when they are not — packaging must
 * never depend on an archive nobody declared.
 */
export const INVENTORY_RECORDED_IN: readonly string[] = [
  "1571178",
  "bb574b6",
  "7e3c00a",
  "a326a87",
  "189f8d8",
  "ee954b8",
  "c6fdc73",
  "f1dbffd",
  "6889aa0",
  "e18f860",
];

/**
 * The bundle Vercel was last ACTUALLY enumerated for.
 *
 * An explicit constant, never derived from the tail of the list above. Moving
 * it requires a real enumeration — which is a Vercel access, and therefore a
 * deliberate act with its own authorisation, not a side effect of shipping
 * another bundle.
 */
export const LAST_VERCEL_ENUMERATION = "f1dbffd";

/**
 * The record of what has actually been handed over, bundle by bundle.
 *
 * DECLARED, not read back. The previous packager recovered these by opening
 * seven earlier archives, which meant a fresh clone could not rebuild the
 * package at all — the generator depended on artefacts nobody had declared as
 * inputs. They live here instead, so the outer hash of every delivered archive
 * is quotable without the archive being present, and
 * supabase/test/artefact-consistency.test.ts re-verifies each one against the
 * file on disk when it happens to be there.
 *
 * The current bundle's own hash is deliberately absent: it cannot be known
 * until the archive exists, and embedding it would change the bytes it names.
 */
export const DELIVERED_ARCHIVES: readonly { readonly bundle: string; readonly sha256: string }[] = [
  { bundle: "1571178", sha256: "6362606257f558af5e46c77c5b9acccd27237198e6a6a3baeec8399bbfa0534d" },
  { bundle: "bb574b6", sha256: "8d1001a8b9758626e93ebbc5ae3dea23c9e1c9633d2a1ccf775ea2a7bf23b91e" },
  { bundle: "7e3c00a", sha256: "c8122e324fffe800ffe8b49db5cd7805f9c7d036db86cca8607917a2bc3acc08" },
  { bundle: "a326a87", sha256: "ac8cbd2e4ec8eb7c5ce0038b98bf8c4ad13880a56bbd6168a424c5db2134b393" },
  { bundle: "189f8d8", sha256: "4892f365cc1ed03cec86f3564bc46fb3de32fa71044d187446c8909789c0d6cd" },
  { bundle: "ee954b8", sha256: "cf60c7ca8313a296a64721920d9508fbc20051a6a1a0ef5575e7673241948c43" },
  { bundle: "c6fdc73", sha256: "a5c9b29d9e1fa52cd85b2fe1f15bd0e90e1df9c1e05fe88d7bdbd9d39fc77fa6" },
  { bundle: "f1dbffd", sha256: "7b36f149ffa9bd0a54e84c2ce956c5cadb15fff3e09900c07adac6649e36858d" },
  { bundle: "6889aa0", sha256: "f9830ad79249367fc0f3df1b25ca4df942261c9857e4bb6972191d1da8f3b7c5" },
  { bundle: "e18f860", sha256: "29abdb4168763caa93b976e2ac7018ba2f2d61e8fb5a03f9599ef03f964a5896" },
];

export interface Deployment {
  readonly target: "preview" | "production";
  readonly sha: string;
  readonly ref: string;
  readonly url: string;
}

/**
 * Every READY deployment, enumerated to pagination exhaustion.
 *
 * Twenty is also `vercel ls`'s page size, which is exactly why the runbook
 * insists on following `--next` until it is empty: a full first page is the
 * shape of a list that looks complete and is not.
 */
export const DEPLOYMENTS: readonly Deployment[] = [
  {
    target: "preview",
    sha: "3f298a6",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-7gxkg1ys1-",
  },
  { target: "preview", sha: "3515402", ref: "main", url: "iris-observer-8iiggb0gi-" },
  { target: "production", sha: "3515402", ref: "main", url: "iris-observer-p1w0s2uph-" },
  {
    target: "preview",
    sha: "1ee5d2d",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-e5v4hn8rb-",
  },
  {
    target: "preview",
    sha: "b33f13d",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-q8cb1zm14-",
  },
  {
    target: "preview",
    sha: "d12d7d8",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-in7ze22je-",
  },
  {
    target: "preview",
    sha: "b1f9f03",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-qk9qqphx8-",
  },
  {
    target: "preview",
    sha: "beeae07",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-a034iybw2-",
  },
  {
    target: "preview",
    sha: "79ed148",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-4uojc5wcp-",
  },
  {
    target: "preview",
    sha: "c9794f7",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-aocqqws9g-",
  },
  { target: "preview", sha: "3515402", ref: "main", url: "iris-observer-8n4lqwyxx-" },
  { target: "preview", sha: "3515402", ref: "main", url: "iris-observer-frmtcvi25-" },
  { target: "preview", sha: "3515402", ref: "main", url: "iris-observer-hrldflqev-" },
  { target: "production", sha: "3515402", ref: "main", url: "iris-observer-by0vp5t48-" },
  {
    target: "preview",
    sha: "f483043",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-84ye5iapo-",
  },
  {
    target: "preview",
    sha: "17ef644",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-oz3wirfgy-",
  },
  {
    target: "preview",
    sha: "01615b9",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-7vlwi7q71-",
  },
  { target: "production", sha: "3515402", ref: "main", url: "iris-observer-4qy9yir96-" },
  {
    target: "preview",
    sha: "364a7a7",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-ibr2cklxr-",
  },
  {
    target: "preview",
    sha: "f563168",
    ref: "release/observer-demo-rc1",
    url: "iris-observer-gw9jgo8sz-",
  },
];

/** How each deployed SHA must be retired, classified from its source. */
export type Capability =
  /** Calls a legacy façade. The contract migration removes the RPC. */
  | "facade"
  /** Reaches thirteen-argument admission and writes `pseudonym_version = 1`. */
  | "version1"
  /** Writes nothing to this database at all. */
  | "none";

export const CAPABILITY: Readonly<Record<string, Capability>> = {
  "3515402": "none",
  f563168: "facade",
  "364a7a7": "facade",
  "01615b9": "facade",
  "17ef644": "facade",
  f483043: "facade",
  c9794f7: "facade",
  "79ed148": "facade",
  beeae07: "facade",
  b1f9f03: "facade",
  d12d7d8: "facade",
  b33f13d: "facade",
  "1ee5d2d": "none",
  "3f298a6": "version1",
};
