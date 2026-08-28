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
/**
 * WHAT THIS QUERY SELECTS, AND ONLY THAT.
 *
 * Six fields: an observation time, a bucket count with its oldest and newest
 * ages, an audit-row count and an audit-version-1 count. Nothing else.
 *
 * REVIEW, RETENTION-EVIDENCE and COMPATIBILITY-EVIDENCE attributed a great deal
 * more to "that one query" — schema shapes, function arities, a migration
 * catalogue, cron state. This query selects none of it, and a document that
 * says otherwise is describing a query nobody ran. Those fields now carry
 * their own provenance, or `UNKNOWN`, and none of them is attributed here.
 *
 * The text is also preserved AS IT WAS RUN, duplicate `n` column names and all.
 * A future reading may use unique aliases; rewriting this string would produce
 * a query that reads better and that nobody executed, and the observation would
 * then be attributed to it.
 */
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

/**
 * EXACTLY WHAT `SNAPSHOT_QUERY` SELECTS, and nothing else.
 *
 * ## What was wrong with one object
 *
 * The query selects six columns: an observation time, a bucket count, the
 * oldest and newest bucket ages, an audit-row count and a version-1 audit-row
 * count. It does NOT select the pseudonym column state, the RPC argument list,
 * whether the retention function exists, how many legacy façades remain, or
 * whether pg_cron is installed.
 *
 * Those five values nonetheless sat in the same object and were described in
 * three documents as fields of that observation — "as recorded by the catalogue
 * query in the carried-forward snapshot". They came from somewhere else, at some
 * other time, by some other means, and nothing recorded which. One object made
 * six measured values and five unsourced ones indistinguishable.
 *
 * The split is the correction. This half is a query result and carries its
 * timestamp honestly; the other half is {@link CATALOGUE_STATE}, where each
 * value must name its own evidence or render as UNKNOWN.
 */
export const SNAPSHOT_RESULT = Object.freeze({
  observedAt: "2026-08-27 01:21:22.693002+00",
  buckets: 78,
  oldestBucketHours: 49,
  newestBucketHours: 29,
  auditRows: 133,
  auditVersion1Rows: 133,
});

/** One catalogue fact and whatever is actually known about where it came from. */
export interface CatalogueFact {
  /** The value last recorded, or null when nothing was ever recorded. */
  readonly value: number | null;
  /** The exact query that established it, or null when none is recorded. */
  readonly query: string | null;
  /** When it was established, or null. Never borrowed from another read. */
  readonly observedAt: string | null;
}

/**
 * The five values that were never in the snapshot query's result.
 *
 * NO QUERY IS RUN NOW to fill these in — this milestone makes no external
 * access of any kind. Each is recorded with what is genuinely known about it,
 * which for all five is: a value was carried forward, and nothing records which
 * query produced it or when. They therefore render as UNKNOWN wherever a
 * document would otherwise state them as observations, and the carried value is
 * shown only where it is labelled as carried.
 */
export const CATALOGUE_STATE: Readonly<Record<string, CatalogueFact>> = Object.freeze({
  pseudonymVersionColumn: Object.freeze({ value: 0, query: null, observedAt: null }),
  admitArgs: Object.freeze({ value: 13, query: null, observedAt: null }),
  retentionFunction: Object.freeze({ value: 0, query: null, observedAt: null }),
  legacyFacades: Object.freeze({ value: 2, query: null, observedAt: null }),
  pgCron: Object.freeze({ value: 0, query: null, observedAt: null }),
});

/**
 * How a catalogue fact is rendered: the value only when its provenance exists.
 *
 * A number with no query and no timestamp is not an observation, and printing
 * it beside five that are is what made all eleven read as one measurement.
 */
export function renderCatalogueFact(name: string): string {
  const fact = CATALOGUE_STATE[name];
  if (fact === undefined) return "UNKNOWN";
  if (fact.query === null || fact.observedAt === null) {
    return fact.value === null ? "UNKNOWN" : `UNKNOWN (last carried value ${String(fact.value)})`;
  }
  return String(fact.value);
}

/**
 * The whole model, for the fields that legitimately come from one place.
 *
 * Kept so the six query fields have one name across the documents. The five
 * catalogue fields are deliberately NOT here: reaching them requires naming
 * them, and naming them goes through {@link renderCatalogueFact}.
 */
export const LIVE = SNAPSHOT_RESULT;

/**
 * The threshold `observer.run_rate_bucket_retention` will enforce, in hours.
 *
 * Stated once so that "the oldest bucket has crossed the threshold" is a
 * COMPARISON rather than a sentence somebody has to keep true by hand.
 */
export const RETENTION_THRESHOLD_HOURS = 48;

/**
 * Bucket ages recorded across this series, oldest reading first.
 *
 * WITHOUT TIMESTAMPS OR SOURCES, so this is NOT a series of measurements a
 * reader can check. Nothing here records when each number was read, by which
 * query, or against which database state — and eight integers in a row invite
 * exactly the reading the evidence must not offer: that they are successive
 * observations of one thing rising.
 *
 * They are retained because they were recorded, and qualified because that is
 * all that is true of them. Any document rendering this list must say so.
 */
export const OLDEST_BUCKET_HISTORY: readonly number[] = [37, 38, 39, 44, 45, 47, 48, 49];

/** What is actually known about the series above. Rendered beside it. */
export const OLDEST_BUCKET_HISTORY_PROVENANCE =
  "recorded across earlier milestones without individual timestamps or queries; " +
  "not verifiable as successive measurements and not presented as such";

/**
 * When the deployment inventory was last actually enumerated, and what that
 * enumeration said — kept apart from the DATABASE observation time.
 *
 * The two were rendered from one timestamp, so a database reading dated the
 * deployment list as well. They are different reads of different systems and
 * only one of them happened at that moment.
 */
export const DEPLOYMENT_INVENTORY_PROVENANCE = Object.freeze({
  lastEnumeratedFor: "f1dbffd",
  /* Never invented. No record of the enumeration's clock time survives. */
  enumeratedAt: "not recorded",
  newestAtThatEnumeration: "3f298a6",
  currentlyAccurate: "UNKNOWN",
});

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
  /*
   * `8277b0a` carries the same byte-identical 20-row table and was missing.
   * `3f298a6` is a delivery that PREDATES the table, so it belongs to
   * DELIVERED_ARCHIVES and not here — which is the difference between "handed
   * over" and "carries the recorded inventory".
   */
  "8277b0a",
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
  "166be98",
  "1b8b912",
  "7ac84fa",
  "aa579a4",
  "c1b80f0",
  "ab98c7a",
  "20ff3e0",
  "3b746f4",
  "03f43a7",
  "ab1f773",
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
  /*
   * IN DELIVERY ORDER, AND COMPLETE.
   *
   * Two of these were handed over and never declared here — `3f298a6` and
   * `8277b0a` — so every derived count was two short and the byte-comparison
   * baseline pointed at the wrong archive. A list that is the single source of
   * six different facts is a list that has to be complete to be worth anything.
   */
  { bundle: "3f298a6", sha256: "f364fc0e2876bb41f1df20de7d9b5af83af723bf671d5139f47ad30f0d347853" },
  { bundle: "8277b0a", sha256: "30546e6f5873a15aabbff41404fa122bbfe2a01f963204250a69c2eeb02a82bb" },
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
  { bundle: "166be98", sha256: "da4dd7917ea08bcfec114294c0891fe586955b972134047653f68c90e3ffdf9d" },
  { bundle: "1b8b912", sha256: "009e9a835354dbbe1df944034d15617ac0076479d05b7a6e61096785adb59c9c" },
  { bundle: "7ac84fa", sha256: "cab9eeaad0fc1936ecc05faf1c90e94f50d7dd59d817c24d49745f6e72c5200a" },
  { bundle: "aa579a4", sha256: "e52e09fad3558e51b12decee13966cfd75d5edb2e225e237429d72c17ba2ba93" },
  { bundle: "c1b80f0", sha256: "e6b8360f0653ea6a1371c5cc494323bc419a716b5ebfe6eaf11e0b71404133f8" },
  { bundle: "ab98c7a", sha256: "789f6d0fb9546dec6f84f9003762c4357876301104a5bf7d8aec4cbc384fcc75" },
  { bundle: "20ff3e0", sha256: "9e8c62c6898b3695d5b66bac654f8c33f02099546f560596c3c19f746b0c6451" },
  /*
   * Delivered at the start of THIS milestone and rejected by the audit that
   * opened it. Declaring it here is what moves the byte-comparison baseline to
   * `3b746f4`, so every "unchanged since" line in this package spans this
   * milestone rather than the previous one.
   */
  { bundle: "3b746f4", sha256: "42627dd847629b09f6c86ba62a039203923dc7e957a484ff6c78aaf1bb2c5697" },
  /*
   * Delivered at the start of THIS milestone and rejected by the audit that
   * opened it. Declaring it here moves the byte-comparison baseline to
   * 03f43a7, so every "unchanged since" line spans this milestone.
   */
  { bundle: "03f43a7", sha256: "20c2f2ddebe046660ef66ac87d7586eec754214bdb20237be05b44e9cb9a2466" },
  /*
   * Delivered at the start of THIS milestone and rejected by the audit that
   * opened it. It passed every physical check again and was refused for
   * release-protocol, provenance and evidence-contract defects.
   */
  { bundle: "ab1f773", sha256: "cbba7b96e2bd89c368fa5c4321006abc539e11540ba7f80bad12416f9da20817" },
];

/**
 * What happened to each delivered archive, which is not the same as delivering
 * it.
 *
 * "Delivered" says an archive was handed over. It says nothing about whether
 * anybody accepted it, and this repository has now shipped several that were
 * independently reviewed and REJECTED — `c1b80f0` most recently, for staging a
 * gate record its own contract refuses. Calling those "delivered bundles"
 * without qualification reads as a record of accepted work.
 *
 * `unreviewed` is the honest default: absence of a rejection is not acceptance.
 */
export type ArchiveOutcome = "accepted" | "rejected" | "unreviewed";

export const ARCHIVE_OUTCOMES: Readonly<Record<string, ArchiveOutcome>> = {
  /*
   * Only outcomes with EXPLICIT EVIDENCE are named, and `accepted` has never
   * been one of them. Everything else stays `unreviewed` by omission rather
   * than being promoted.
   */

  /*
   * Rejected on its own evidence: the archive shipped eight forbidden control
   * bytes in three patch files, independently verified, and REVIEW itself calls
   * them unacceptable. An archive a package says is unacceptable is not an
   * unreviewed one.
   */
  "1b8b912": "rejected",
  aa579a4: "rejected",
  c1b80f0: "rejected",
  /* Rejected by the independent audit that opened the previous milestone. */
  ab98c7a: "rejected",
  /*
   * Rejected on evidence-contract grounds by the audit that opened this one.
   * The archive passed every physical check — hashes, manifest, entries,
   * control characters, patch chain, SQL equality — and was refused for what
   * its evidence claimed, not for anything it shipped. A green local gate is
   * not acceptance, and nothing here infers acceptance from one.
   */
  "20ff3e0": "rejected",
  /*
   * Rejected by the fifteen-item audit that opened this milestone: a staged
   * evidence module that could not run from the archive, a recovery/publication
   * race, arbitrary child output paths, a manifest command nobody ran, and
   * provenance that named the wrong enumeration. Physical checks passed again;
   * that is not acceptance and is not read as any.
   */
  "3b746f4": "rejected",
  /*
   * Rejected by the eleven-item audit that opened this milestone. It passed
   * every physical check again — outer hash, 124 entries, 123/123 manifest,
   * unzip -t, zero control characters, coherent gate evidence, 69 patches, all
   * 24 packaged SQL files unchanged — and was refused for a publication and
   * recovery that could both partly succeed, a wrapper set accepted by
   * directory, a test that deleted a tracked file, and provenance that
   * attributed five values to a query that never selected them.
   */
  "03f43a7": "rejected",
  /*
   * Rejected by the audit that opened this milestone: a terminal protocol with
   * two reproducible crash states, a predictable recovery sibling path, lock
   * ownership that accepted an equal-length rewrite, two SQL inputs with no
   * tracked origin, and a replacement-commit count typed into prose.
   */
  ab1f773: "rejected",
};

export const outcomeOf = (bundle: string): ArchiveOutcome =>
  ARCHIVE_OUTCOMES[bundle] ?? "unreviewed";

/** Archives handed over that are not the current candidate. */
export const priorDelivered = (candidate: string): readonly string[] =>
  DELIVERED_ARCHIVES.map((a) => a.bundle).filter((b) => !candidate.startsWith(b));

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
