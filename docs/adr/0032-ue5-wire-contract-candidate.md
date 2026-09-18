# ADR-0032 — The UE5 wire contract is an executable package, not a document

**Status:** proposed · 2026-09-01

## Context

The approved UE5 plugin architecture brief settles the shape of the integration — identity spine,
one-time activation, server-derived identity, immutable append-only events, per-event results — and
then describes activation and ingestion as _proposed behaviour_. Akhilesh cannot build UE-OBS-003
through UE-OBS-010 against proposed behaviour, and waiting for the real Edge Functions blocks him on
work that is itself blocked on hosted Supabase access.

The obvious response is a specification document, and that is what the first three drafts were. Prose
has two failure modes here, and both had already started.

**It cannot keep a proposal distinguishable from an approved decision.** Six revisions in, a
convenient recommendation acquires the confident tone of a locked rule, a brief citation gets attached
to something the brief never said, and no reader can tell which is which. Three separate corrections
during drafting were exactly this: a ±48h clock window, a per-batch skew field and a budget-ownership
question, all written as though settled and none of them decided by anybody.

**It cannot be wrong in a way anybody notices.** A document describing per-event results and partial
batch success reads correctly whether or not an implementation could deliver them.

## Decision

The contract is a package with four parts, and the prose is the smallest of them.

1. **Zod schemas** in `packages/contracts/src/ue5/`, following the arrangement `CLAUDE.md` already
   describes for that package: Zod → JSON Schema → OpenAPI → examples. `projection.ts` is a total
   function from a wire event plus server-derived identity to the existing `SourceObservation`, so
   this is provably the transport encoding of ADR-0015's first box rather than a second architecture.

2. **A machine-readable traceability table** classifying every rule as `LOCKED_FROM_BRIEF`,
   `DERIVED_FROM_LOCKED_RULE`, `PROPOSED`, `OPEN` or `MOCK_ONLY`, with tests asserting that a locked
   rule cites a brief section, that nothing proposed cites the brief, that every derivation names its
   antecedent, and that the contract calls itself a candidate while anything is open.

3. **A deterministic reference implementation** in `packages/ue5-mock/` — no database, no network, no
   cryptography, injected clocks, counter-derived identifiers — so our contract tests and Akhilesh's
   transport tests exercise one protocol rather than two readings of a document.

4. **Generated artefacts** under `docs/ue5-contract/`, with a drift test, following the pattern
   `pnpm matrix` already establishes for the measurement matrix.

Numbers nobody has decided are `null`, not guesses. Policies nobody has chosen default to the safe
option and are switchable, not baked in.

## Consequences

**The tests found four defects that reading had not.** The batch schema validated its own events, so
one malformed event would have failed the whole batch and destroyed partial success — a violation of a
locked rule, in the draft that claimed to implement it. The size guard used `JSON.stringify`, which
recurses, so the check against a hostile payload was itself crashed by one. Deduplicating globally on
`event_id` turned a `duplicate` response into a cross-tenant existence oracle. And the forbidden-content
scanner did not recognise Observer's own credential format, which is the likeliest secret to reach an
Observer payload.

**A positive-control harness proves the tests would notice.** Seven deliberate defects are applied one
at a time, the suite is required to fail, and every touched file is restored and checksum-verified.
Without it, "the tests pass" is a claim about the code and not about the tests.

**The cost is a second package and a generation step.** `packages/ue5-mock` has to be maintained
alongside the contract, and `pnpm contracts:ue5` has to be run when a schema changes — enforced,
because the drift test fails otherwise.

**The prose document is now the argument, not the specification.** `docs/ue5-ingestion-contract.md`
explains why each proposal is what it is; the schemas say what it is. When they disagree, the schemas
are right, and a test says so.

**This is not permission to implement.** No endpoint exists, nothing is deployed, and every proposal
here is still a proposal. Five decisions genuinely need Akhilesh, and the rest need a review.

## Amendment, 2026-09-01 — two classifications added

Akhilesh reported UE-OBS-001 through UE-OBS-004 complete, which surfaced a gap in the table this ADR
introduced: it could distinguish an approved rule from a proposal, but it had nowhere honest to put a
**fact**.

That the engine is 5.6, that the credential currently lives at
`Saved/Observer/source_credential.json`, that monotonic sequencing exists — all true, none of them
architecture rules, and all of them free to change next sprint. Recording them as `LOCKED_FROM_BRIEF`
would lend the brief's authority to an implementation detail, which is the same mislabelling this
table exists to prevent, running the other way.

- **`UE_IMPLEMENTATION_CONFIRMED`** — a fact evidenced by completed UE work, carrying the UE package
  that evidences it. It may never be the antecedent of a derivation: a contract rule justified by an
  implementation is an architecture rule argued backwards.
- **`DECIDED_BY_PRODUCT`** — an approved decision that is neither in the brief nor still a proposal,
  carrying who decided and when. The legacy clean-slate decision is the first, and the seven pending
  Matthew proposals will land here as they are signed off. Without it, an approved decision would have
  to be recorded as `PROPOSED`, which misrepresents it.

Both require an `evidence` field that the other five classifications must leave null, and a test
enforces exactly that.

The same pass turned the two packages Akhilesh is starting into generated specifications —
`validation-order.md` for UE-OBS-005 and `outbox-states.md` for UE-OBS-006 — both rendered from the
same constants the validator and the error model use, so a handoff document cannot drift from the
behaviour it describes.
