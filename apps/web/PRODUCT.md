# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four audiences, each with a genuinely different job:

- **Developer leadership** (e.g. a project like ISTER TOWER's owner) — needs evidence for pricing, marketing and forecast decisions across their development(s).
- **Agency management** — an external or internal sales agency operating the project on the developer's behalf; needs coverage, conversion and coaching visibility, with fairness and sample-size protection since it may compare agents.
- **Sales agents** — the day-to-day user; needs their agenda, meeting preparation and follow-up. Their own data-acquisition activity (showroom meetings, CRM updates) is the upstream input everything else depends on.
- **MADSPACE administrators** — operate tenancy, configuration and integration health across every developer/agency on the platform. Reached through a separate surface (`/madspace`), not the customer-facing navigation, and MADSPACE is the vendor operating the platform, not a customer of it.

The property developer buys the product; an internal or external sales agency operates it day to day. That split between buyer and operator is a central, load-bearing constraint on every screen — a developer and an agency manager can legitimately need different things from the same figure.

## Product Purpose

IRIS Observer is a virtual real-estate sales-intelligence system. It joins four sources that describe one sales process from four different vantage points, and composes them into evidence a developer, an agency, or an agent can act on: what changed, why it matters, what to do next, and how reliable the underlying data is.

Success is a reader reaching a decision or an action from the first screen in about ten seconds, backed by evidence they can trust — not a dashboard of disconnected numbers.

## Positioning

It joins WEBIRIS (online buyer behaviour before anybody is known), the CRM (contacts, appointments, authoritative deal stages), IRIS Showroom (what happened in the room) and the unit catalogue (units, attributes, price, availability) — four sources no single one of those systems, on its own, can see together. A generic analytics dashboard built on any one of them cannot truthfully make the same claim.

## Operating Context

- A property development is sold through a **showroom**: a physical or virtual space where a sales agent presents units to prospective buyers in scheduled meetings.
- Buyer interest is expressed in stages before a human is ever involved (browsing WEBIRIS), then through a CRM-tracked pipeline (contact → appointment → deal stage) once an agent is engaged.
- Sales agents prepare for and run showroom meetings, and their outcomes (purchase, reservation, follow-up needed, not interested, etc.) are the evidence the rest of the product reasons from.
- The product currently operates entirely on **synthetic demonstration data** — deterministic fixture tenants, projects and accounts standing in for a real developer/agency/agent's real data, clearly labeled as such in the product (a "Demo data" indicator). It is pre-launch: no real customer, no real showroom, no real CRM is connected yet.
- Ask IRIS, the product's question-answering surface, now answers through a controlled tool architecture against a live model connection on the release-candidate Preview deployment. When the model cannot be reached, the same deterministic composer that used to be the only path answers from the identical tools — read models, directly from the (synthetic) evidence — and `status.live` records which one produced a given answer. The separate, stale Production URL is not confirmed to hold this connection.

## Capabilities and Constraints

- **Evidence tiers are never merged.** An observed sequence, an attributed conversion and a statistically-associated pattern are three different claims; the product never states one as if it were another, and never asserts causation.
- **A CRM deal stage is authoritative; online intent is a signal.** The two are never computed as if they were the same measurement.
- **No metric without a denominator, no verdict without a stated sample size, no screen without an action.** Below a minimum sample size, the product shows the raw figure and says how far short it is rather than a rank or a trend.
- **An absent value is never rendered as zero.** Empty, insufficient, unavailable and error are four distinguishable states.
- **Durations are reported as percentiles, not means.**
- **No personal data travels in behavioural payloads** — contact identifiers only.
- **The pre-meeting brief prepared for a sales agent never reaches a buyer-visible surface.**
- **Nothing is fabricated to make a screen or chart look finished.** A gap in the synthetic data is stated as a gap, not papered over.
- **A live language model is now connected on the release-candidate Preview deployment.** The deterministic-answer behavior remains as the fallback path when the model cannot be reached, not the default — `status.live` on each answer says which one actually produced it. The Production URL is a separate, older deployment and is not confirmed to hold the same connection.
- **Multi-tenant, multi-project, role-gated.** An account's grants determine which tenants, projects and figures it can see; enforced in the repository layer, not only in the UI.
- Terminology a reader is expected to already know: _tenant_ (a developer's organisation), _project_ (one development, e.g. a residential tower), _unit_ (one sellable apartment/property within a project), _showroom_ (where meetings happen), _evidence tier_ (observed/attributed/verified).

## Brand Commitments

- The product name is **IRIS**, presented as **"IRIS by MADSPACE"** — MADSPACE is the vendor/platform operator; IRIS is the product a developer or agency actually uses.
- MADSPACE's own administrative surface is a deliberately separate visual and navigational system from the IRIS customer product — it is not a MADSPACE-branded skin of the same screens, and it is never reachable from the customer-facing navigation.

## Evidence on Hand

- No real customer, testimonial, case study, press mention or production dataset exists yet. Every project, tenant, meeting and figure in the current product is synthetic fixture data, explicitly labeled as demonstration data on screen.
- Future work must not invent a customer, a quote, a benchmark, or a "real" data source that does not exist — the synthetic read-model layer is the only source of truth until a real integration milestone connects one.

## Product Principles

1. **Clarity, context, usefulness, decisions, actions — never a collection of disconnected data boxes.** Every screen answers, in order: is performance positive/negative/inconclusive, what changed, why it matters, what to do next, what evidence supports it, and how complete/reliable the data is.
2. **Honesty overrides polish.** An evidence tier, a sample-size caveat, or a "data unavailable" state is never smoothed away to make a screen look more finished than the underlying evidence supports.
3. **The buyer and the operator are different readers with different needs**, even when they are looking at figures drawn from the same underlying events.
4. **The sales agent's day is the input, not an afterthought.** Everything upstream (developer forecasts, agency coaching) depends on agents actually recording what happened in a meeting.
5. **Nothing is fabricated to fill a gap** — a gap in the data is a fact the product states, not a problem the product hides.

## Accessibility & Inclusion

No formal accessibility standard (e.g. contractual WCAG level) is currently required. The existing codebase treats accessibility as a genuine quality bar in practice (automated `axe-core` checks run in the test suite against key screens), and future work should preserve that bar rather than treat it as optional, but no external commitment binds a specific conformance level today.
