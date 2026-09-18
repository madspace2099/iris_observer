/**
 * The test pepper, set explicitly and only here.
 *
 * `OBSERVER_SUBJECT_PEPPER` is mandatory: there is no fallback, no derivation
 * from another credential and no per-process default, because every one of
 * those was a way for a deployment to look configured while producing bucket
 * keys that meant nothing. The consequence is that the suite has to supply one,
 * and supplying it *here* rather than inside a helper is the point — an
 * implicit default that happened to work in tests is exactly how a production
 * fallback gets reintroduced without anybody deciding to.
 *
 * The value is deliberately not secret-shaped. It is sixty-four `a`s: long
 * enough to pass the length rule, obviously not random, and rejected outright
 * by `describePepper` on any deployment. `VITEST` is what tells the validator
 * it may accept it, and nothing sets `VITEST` on Preview or Production.
 *
 * Tests that need a *different* key set the variable themselves and restore it;
 * tests that need it *absent* delete it and restore it. Both are ordinary, and
 * both are how the fail-closed path is exercised.
 */
process.env["OBSERVER_SUBJECT_PEPPER"] = "a".repeat(64);
