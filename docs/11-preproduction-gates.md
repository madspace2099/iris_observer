# Pre-production gates

**Status:** required review · **Date:** 2026-08-24 · **EU AI Act added to Gate 1:** 2026-09-17

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
| **The EU AI Act**                  | A separate regulation with its own questions and its own dates. See the section below.                                                                      | below                                      |
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

### The EU AI Act

**Added 2026-09-17.** Until then the repository never mentioned it. Read that day from the Official
Journal text: Regulation (EU) 2024/1689 ([ELI](http://data.europa.eu/eli/reg/2024/1689/oj)) as
amended by Regulation (EU) 2026/1744, the Digital Omnibus on AI, in force since 27 July 2026
([ELI](http://data.europa.eu/eli/reg/2026/1744/oj)). What follows is issue-spotting for the reviewer
and not a legal opinion. The law moves: check both links again before relying on a date below.

**Roles, as MADSPACE states them (2026-09-17).** The provider is MADSPACE s.r.o., established in
Slovakia. The deployer is the client company under contract with it. The date Observer is first
placed on the Union market is not set, and two rows below turn on it.

**Blocks:** two moments, neither of them the one the rest of this gate blocks.

- _Connecting a language model to any surface a customer can reach_: the first three rows.
  `apps/web/test/ai-notice-tripwire.test.ts` goes red the day a page does.
- _Placing Observer on the market_: the fourth and fifth rows.

| Item                                                    | Question for review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Where the behaviour is described                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Telling a person they are dealing with an AI system** | Article 50(1) and (5), applicable since 2 August 2026. Is the reader told "in a clear and distinguishable manner at the latest at the time of the first interaction or exposure", or is it "obvious"? The Commission reads that exception restrictively.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | MADSPACE's decision below; `apps/web/src/components/ask-iris/AskScreen.tsx`; the unmounted `apps/web/src/showroom/observer/Answer.tsx`, whose heading for a model-written answer says less about AI than its heading for a deterministic one                                                                                                                          |
| **Marking model-written text**                          | Article 50(2): must the output be "marked in a machine-readable format and detectable as artificially generated"? Does the exception for output that does "not substantially alter the input data provided by the deployer" reach a model that may only re-word a draft the system itself computed? Article 111(4) gives until 2 December 2026 to systems placed on the market before 2 August 2026, which Observer was not.                                                                                                                                                                                                                                                                                     | the draft the model may re-word, in `apps/web/src/lib/ai/agent.ts`; `model_authored` in `supabase/migrations/20260825205000_observer_audit_provenance.sql`, which is a record and not a marking                                                                                                                                                                       |
| **Voice**                                               | The same two questions for a spoken interface: what is said or shown before the first spoken exchange, and who marks the synthetic speech, the model's vendor or the system built on it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `apps/web/src/lib/ai/voice.ts`, which refuses unconditionally; ADR-0031                                                                                                                                                                                                                                                                                               |
| **Evaluating named sales agents**                       | Annex III point 4(b), applicable from 2 December 2027: is any part of Observer an AI system "intended to be used … to monitor and evaluate the performance and behaviour of persons in such relationships"? Does fixed-threshold arithmetic meet the definition in Article 3(1) at all? Article 6(3) closes its derogation to a system that "performs profiling of natural persons". Article 6(4) wants a provider's contrary view documented before placing on the market. Article 26(7) has a deployer who is an employer tell workers' representatives and the workers first. Article 111(2) as amended reaches a system placed on the market before that date only after a significant change to its design. | the `concern` and `watch` flags of `outcomeFlag` in `packages/synthetic/src/showroom/views3.ts`, raised above eight meetings and printed as a lead finding under the agent's name; ADR-0029, by which colleagues on a project see each other's figures; `compare_agent_flows` and the coaching route in `apps/web/src/lib/ai/`, unmounted; `docs/01-foundation.md` §1 |
| **AI literacy**                                         | Article 4 as replaced by Regulation (EU) 2026/1744, applicable since 2 February 2025: what "measures to support the development of AI literacy" does MADSPACE take for its own staff, and what does it hand a deployer for theirs? Undecided on 2026-09-17.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the "How to read this" panels in the product; no training or guidance document exists                                                                                                                                                                                                                                                                                 |
| **The showroom's own Ask IRIS**                         | The same Article 50 questions, where the person interacting may be a buyer. Not connected and not functional on 2026-09-17.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | the IRIS showroom application, outside this repository                                                                                                                                                                                                                                                                                                                |

**MADSPACE's decision on disclosure (2026-09-17).**

- Every AI-written answer in the dashboard comes from one place, the Ask prompt box. The notice that
  the reader is dealing with an AI system belongs there, in view before the first question is sent.
- If AI-written or AI-evaluated content ever appears anywhere else in the dashboard, the reader is
  told where it appears. A pop-up was proposed.

An engineering note on the second: on 2026-09-17 no model evaluates anything outside the prompt box.
Every other figure is fixed arithmetic over read models, and the surfaces name their sources with
provenance chips. So there is nothing for such a notice to attach to yet, and one must not be shown
over content no model touched. When there is, the `AI interpretation` chip already exists for it. Whether a pop-up that
is shown once and can be dismissed is "clear and distinguishable … at the latest at the time of the
first interaction or exposure" for every reader, and accessible, is the reviewer's question.

**What is already built to support this part of the review.** Engineering facts, not compliance
claims:

- No surface a reader can reach calls a language model. The path is complete, gated per account
  (ADR-0030) and tested, and it is mounted on no page. The prompt box answers from read models and
  says on screen that no language model wrote the answer.
- Voice refuses unconditionally on the server, and `Permissions-Policy` blocks the microphone.
- The audit row records whether a model wrote an answer (`model_authored`, `author_model`) and a
  database constraint makes the two agree. No prompt and no answer text is stored, and the vendor is
  told `store: false`.
- The model's instructions forbid inferring a person's income, family, health, ethnicity, sexual
  orientation, political opinion, religion or financial distress, beside the ten categories
  declared as data.
- Nothing in the code recognises emotion, processes biometric data, generates an image, audio or
  video of a person, or makes a price, credit or eligibility decision about a person.
- The pre-meeting brief reaches no buyer-visible surface (ADR-0018).
- The per-agent surfaces refuse a ranking and a score, hold a twenty-meeting floor before a rate is
  read as a verdict, and say so on screen.

**Not checked:** how a deployed instance behaves, the showroom application, WEBIRIS, any contract or
notice. The Commission's guidelines on Article 50 (20 July 2026) were located and not read; its FAQ
(updated 24 July 2026) and the voluntary Code of Practice on Transparency of AI-generated Content
(final 10 June 2026) were read only in summary. Corrigenda to the Regulation exist in Hungarian,
Slovak, German, French and Czech and none in English, the language read.

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
