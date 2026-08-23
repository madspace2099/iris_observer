# The pre-meeting brief

**Status:** contract, v0.1 · **Date:** 2026-08-24 · **Milestone:** M1
**Implements:** `packages/contracts/src/brief.ts` · **Decides:** ADR-0010

The brief is the artefact that makes the two-sided product work. The developer buys Observer, but the
sales agent produces its data, and the agent will only keep feeding a system that hands them something
worth having before they walk into the room.

A brief that says _"she has looked at three two-bedroom units twice each and keeps filtering for
south-facing"_ is worth having. A dashboard about the agent is not.

---

## 1. Three sections, kept apart

Collapsing these is how an analytics product starts lying.

| Section               | Contains                                       | Tier                          |
| --------------------- | ---------------------------------------------- | ----------------------------- |
| **1. Observed**       | what is recorded. No inference whatsoever.     | observed sequence             |
| **2. Interpretation** | what the data supports, with its support count | association, labelled         |
| **3. Recommended**    | what to do about it                            | actions, each with its reason |

Every sentence in all three carries an evidence reference and a drill-down. A statement without one
cannot be rendered — that constraint is what stops the intelligence layer drifting into confident prose
with nothing under it.

---

## 2. Section one — observed

| Field                         | Note                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Meeting and contact context   | project, agent, scheduled time, **all participants** (a couple is briefed as a couple), returning-buyer flag, previous meeting count |
| Last online activity          | date and days since                                                                                                                  |
| Session count and dates       | the pattern of returning matters more than the total                                                                                 |
| Viewed units                  | with **unique views**, not raw view events — reopening a panel is not fresh interest                                                 |
| Meaningful dwell              | above a threshold that separates looking from scrolling past. The threshold is a registry parameter, never a number buried in code   |
| Favourites                    |                                                                                                                                      |
| Compare sets                  | with the kept unit where known. The strongest in-app decision signal                                                                 |
| Applied filters               | with the last result count: did the search narrow, or give up?                                                                       |
| Observed price range          | **only when the buyer actually set a price filter**                                                                                  |
| Downloaded or shared material |                                                                                                                                      |
| Back-linked flag              | whether some history was attached after identification                                                                               |

**On the price range.** A range guessed from the prices of units they happened to open is an inference
and belongs in section two. This distinction is not pedantry: an agent told _"her budget is 180–220"_
will negotiate on it, and if that number came from three apartments she clicked past, the negotiation
starts from fiction.

---

## 3. Section two — interpretation

Preferred unit attributes, each with `supportCount` and `totalObservations`.

The support count is not decoration. _"South-facing, in seven of nine filter applications"_ is a
different claim from _"south-facing, seen once"_, and an agent can weigh the first and discard the
second. Confidence is categorical and explained — a level plus a reason, never a manufactured
percentage that implies precision the data does not have.

### What may never be inferred

`PROHIBITED_INFERENCE_CATEGORIES` lists them as data, so the generator can be tested against them:
health or disability, pregnancy or family planning, ethnicity or national origin, religion, political
opinion, sexual orientation, trade union membership, financial distress, immigration status, criminal
history.

Buying a home is bound up with pregnancy, divorce, illness and money trouble, and browsing behaviour
genuinely does correlate with all of them. That is exactly why the line is drawn here: the inference
would often be **right**, and it would still be indefensible to put in front of a salesperson.

Two further prohibitions:

- **No unsupported assumption presented as a customer fact.** If the data cannot settle it, it becomes
  a clarification question, not an assertion.
- **No claim about an individual at the association tier.** "Buyers like her usually…" is not a fact
  about her.

---

## 4. Section three — recommended

| Field                                  | Note                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Units to prepare                       | each with an evidence-backed reason and current availability                 |
| Units still available                  | availability is checked at generation time, not copied from the last visit   |
| Previously interested, now unavailable | telling the agent that her favourite sold last week is worth the whole brief |
| Relevant changes since the last visit  | price moves, status changes, new availability                                |
| Suggested clarification questions      | each with its rationale                                                      |

**Why questions rather than conclusions.** _"She filtered for south-facing every time, but both units
she favourited face west — worth asking which matters more"_ is useful. _"She wants west-facing"_ is a
guess dressed as a fact. The question form is honest about what the data can and cannot settle, and it
gives the agent something to actually say.

---

## 5. Missing data

A brief assembled while the CRM connector is down is still worth reading, but the agent must be able to
tell the difference between **"no prior interest"** and **"we could not see it"**.

`dataHealth` carries completeness, the sources present and missing, and for each gap what it is and
what it costs. The UI renders this; it is not a footnote.

---

## 6. Product placement

No new primary navigation item.

| Surface                          | Form                                            |
| -------------------------------- | ----------------------------------------------- |
| Sales agent Overview             | brief cards for upcoming meetings, mobile-first |
| Meeting drill-down               | the full brief, next to what actually happened  |
| Contact drill-down, under People | the complete unified timeline                   |

---

## 7. Open questions

| #   | Question                                                                                 | Blocks                                                                                       |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | What dwell threshold separates a genuine view from a glance, online and in the showroom? | `meaningfulDwellMs`                                                                          |
| 2   | Should the brief be pushed (email or notification before the meeting) or pulled?         | agent workflow in M6                                                                         |
| 3   | May the agent see the brief for a contact assigned to a colleague?                       | permission model                                                                             |
| 4   | Is any part of the brief ever shown on the showroom display the buyer can see?           | **must be no by default** — prior buyers' identities cannot appear on a client-facing screen |
