# Pre-production gates

**Status:** required review · **Date:** 2026-08-24

Work that is **finished in the product and blocked before production** until somebody outside
engineering signs it off. A gate is not a gap: the decision is made, the behaviour is built, and the
question is whether it may be pointed at real people.

Nothing in this repository asserts that IRIS Observer is legally compliant. These documents describe
what the system does, so that a reviewer can judge it.

---

## Gate 1 — Privacy and legal review

**Blocks:** the first project processing real buyer data.

Observer stores identified behavioural profiles of consumers — what a named person looked at, for how
long, what they shortlisted, and what a model infers from it. That is a materially different thing
from counting page views, and it needs a decision from somebody qualified to make one.

| Item                               | Question for review                                                                                                                                         | Where the behaviour is described           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Privacy notice**                 | What are buyers told, where, and by whom — the developer, the agency, or both?                                                                              | `docs/01-foundation.md` §5                 |
| **Lawful basis**                   | On what basis is behavioural data linked to an identified buyer, per channel? Consent, legitimate interest, or contract?                                    | `docs/05-identity.md` §2.5                 |
| **Consent wording**                | The exact text shown at lead submission and at the start of a showroom meeting, and its versioning.                                                         | `Lead.consent.textVersion`                 |
| **Retention**                      | How long source observations, canonical facts, contacts and intent signals are kept.                                                                        | `docs/09-ingestion.md` §6                  |
| **Deletion and anonymisation**     | Whether tombstoning satisfies an erasure request, and what counts as sufficient anonymisation of the behavioural record that remains.                       | `docs/05-identity.md` §4                   |
| **CRM data sharing**               | What flows to REALPAD or Monday, what flows back, and under whose instruction.                                                                              | `docs/06-ownership.md`                     |
| **Sales-agency access**            | What a contracted agency may see about a buyer, and what happens to that access when the contract ends.                                                     | `docs/01-foundation.md` §2                 |
| **AI processing**                  | That generated summaries and intent signals are automated processing of personal data, where they run, and whether any decision they inform is significant. | `docs/07-pre-meeting-brief.md`, `ADR-0021` |
| **Forbidden inference categories** | That the declared prohibitions are the right ones, and complete.                                                                                            | `PROHIBITED_INFERENCE_CATEGORIES`          |

### What is already built to support the review

These are engineering facts the reviewer can rely on, not compliance claims:

- Behavioural payloads carry `contact_id` only. No name, email or phone enters an event.
- Consent is captured as data at lead submission, with the text version, and governs whether
  pre-identification activity may be attached at all.
- Back-linked history is labelled in the interface, so an agent can see which part of a buyer's
  history the buyer never volunteered.
- Deletion removes identity links and applies the configured retention or anonymisation policy — it
  is not a flag flip.
- A persistent pseudonymous identifier is treated as protected while it remains linkable.
- Ten inference categories are declared as data and enforced by test.
- Row-level security and application authorisation are both required; the identity hash is a matching
  device and is not an access control.

---

## Gate 2 — Production authentication

**Blocks:** any deployment reachable by somebody outside MADSPACE.

The current sign-in is a **scenario selector** (ADR-0022). It holds one real property — the browser
cannot grant itself a tenant or a role — and nothing else. Before production it needs an identity
provider, account lifecycle, credential recovery, and session revocation that survives a restart.

---

## Gate 3 — Device credentials for ingestion

**Blocks:** the first showroom installation sending real data.

Each installation needs its own write-only credential, scoped to one tenant and project, issuable and
revocable from administration. The legacy system shipped one shared key inside every build, which is
how its data ended up publicly readable (ADR-0005). That must not be repeated.

---

## Gate 4 — Data processing agreement

**Blocks:** onboarding the first paying developer.

Who is controller and who is processor between MADSPACE, the developer and the sales agency is a
contractual question with an engineering consequence: it decides who may instruct a deletion and who
must answer a subject access request. Until it is settled, the administration surface cannot know who
is allowed to press which button.
