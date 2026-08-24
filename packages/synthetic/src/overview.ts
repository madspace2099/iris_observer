import type {
  ActionItem,
  AiBriefing,
  AlertItem,
  ChangeItem,
  DataHealth,
  ExecutiveOverview,
  FunnelStep,
  MetricValue,
  Verdict,
  ViewContext,
} from "@observer/readmodels";
import { DEFAULT_ATTRIBUTION_POLICY } from "@observer/metrics";
import {
  comparison,
  compactMoney,
  count,
  days,
  evidenceRef,
  insufficient,
  money,
  ok,
  percent,
  unavailable,
} from "./format";

/**
 * Executive Overview, per project shape.
 *
 * Three projects, three different screens, all from the same builder:
 *
 *  - **Northgate** is complete and has a real problem to find. It is the
 *    screen the product is judged on.
 *  - **Riverside** has no CRM, so everything below the meeting must render its
 *    unavailable state rather than a smaller number.
 *  - **Kingsford** is three weeks old, so every verdict must be suppressed.
 *
 * Those are not three demos. They are the three states every customer passes
 * through, and building them together is what stops the empty and partial
 * cases being an afterthought.
 */

const POLICY = DEFAULT_ATTRIBUTION_POLICY.version;

function base(context: ViewContext) {
  const { project, tenant } = context;
  const root = `/${tenant.slug}/${project.slug}`;
  return {
    root,
    locale: project.locale,
    currency: project.currency,
  };
}

/* --- Northgate: the complete case ---------------------------------------- */

function northgate(context: ViewContext): ExecutiveOverview {
  const { root, locale, currency } = base(context);

  const headline: MetricValue[] = [
    ok({
      metricId: "exec.units_sold",
      label: "Units Sold",
      display: count(7, locale),
      raw: 7,
      qualifier: "of 34 remaining",
      sampleSize: 7,
      minimumSampleSize: 1,
      comparison: comparison("previous quarter", "−22%", "down", "up"),
      evidence: evidenceRef("northgate.units_sold", "observed_sequence", `${root}/flow`, 7),
      drillHref: `${root}/flow`,
    }),
    ok({
      metricId: "exec.revenue",
      label: "Revenue",
      display: compactMoney(1_524_000, currency, locale),
      raw: 1_524_000,
      qualifier: `of ${compactMoney(5_910_000, currency, locale)} inventory`,
      sampleSize: 7,
      minimumSampleSize: 1,
      comparison: comparison("previous quarter", "−18%", "down", "up"),
      evidence: evidenceRef("northgate.revenue", "observed_sequence", `${root}/flow`, 7),
      drillHref: `${root}/flow`,
    }),
    ok({
      metricId: "exec.avg_days_to_close",
      label: "Average Days to Close",
      display: days(68),
      raw: 68,
      qualifier: "80th percentile 104",
      sampleSize: 12,
      minimumSampleSize: 10,
      comparison: comparison("previous quarter", "+6 days", "up", "down"),
      evidence: evidenceRef("northgate.days_to_close", "observed_sequence", `${root}/flow`, 12),
      drillHref: `${root}/flow`,
    }),
    ok({
      metricId: "exec.active_buyers",
      label: "Active Buyers",
      display: count(23, locale),
      raw: 23,
      qualifier: "in the last 28 days",
      sampleSize: 23,
      minimumSampleSize: 1,
      comparison: comparison("previous period", "+3", "up", "up"),
      evidence: evidenceRef("northgate.active_buyers", "observed_sequence", `${root}/people`, 23),
      drillHref: `${root}/people`,
    }),
  ];

  const funnel: FunnelStep[] = [
    {
      label: "Viewing to Offer",
      fromCount: 46,
      toCount: 12,
      metric: ok({
        metricId: "flow.viewing_to_offer",
        label: "Viewing to Offer",
        display: percent(12 / 46, locale),
        raw: 12 / 46,
        qualifier: "12 of 46",
        sampleSize: 46,
        minimumSampleSize: 20,
        comparison: comparison("previous quarter", "−9%", "down", "up"),
        evidence: evidenceRef("northgate.v2o", "observed_sequence", `${root}/flow`, 46),
        drillHref: `${root}/flow`,
        policyVersion: POLICY,
      }),
    },
    {
      label: "Offer to Reservation",
      fromCount: 12,
      toCount: 7,
      metric: ok({
        metricId: "flow.offer_to_reservation",
        label: "Offer to Reservation",
        display: percent(7 / 12, locale),
        raw: 7 / 12,
        qualifier: "7 of 12",
        sampleSize: 12,
        minimumSampleSize: 15,
        comparison: comparison("previous quarter", "+4%", "up", "up"),
        evidence: evidenceRef("northgate.o2r", "observed_sequence", `${root}/flow`, 12),
        drillHref: `${root}/flow`,
        policyVersion: POLICY,
      }),
    },
    {
      label: "Reservation to Sale",
      fromCount: 7,
      toCount: 5,
      metric: insufficient(
        {
          metricId: "flow.reservation_to_sale",
          label: "Reservation to Sale",
          display: percent(5 / 7, locale),
          raw: 5 / 7,
          qualifier: "5 of 7",
          sampleSize: 7,
          minimumSampleSize: 10,
          evidence: evidenceRef("northgate.r2s", "observed_sequence", `${root}/flow`, 7),
          drillHref: `${root}/flow`,
        },
        "Fewer than 10 reservations — shown as a raw figure, not as a verdict.",
      ),
    },
  ];

  const verdict: Verdict = {
    state: "watch",
    headline:
      "Northgate sold 7 units this quarter against 9 in the last — 22% slower, and the loss is entirely between viewing and offer.",
    supporting:
      "Two-room units draw 2.1× their share of attention and convert at half the project average. The interest is real; the price probably is not.",
    evidence: evidenceRef("northgate.verdict", "observed_sequence", `${root}/flow`, 46),
  };

  const changes: ChangeItem[] = [
    {
      id: "velocity",
      label: "Sales velocity",
      deltaDisplay: "−22%",
      direction: "down",
      better: "up",
      detail: "7 units this quarter against 9 last. Sell-out moves from Q3 2027 to Q1 2028.",
      evidence: evidenceRef("northgate.velocity", "observed_sequence", `${root}/flow`, 16),
      href: `${root}/flow`,
    },
    {
      id: "two-room-attention",
      label: "Two-room attention",
      deltaDisplay: "+34%",
      direction: "up",
      better: "up",
      detail: "Attention index now 2.1, but conversion is half the project average.",
      evidence: evidenceRef("northgate.tworoom", "observed_sequence", `${root}/project`, 61),
      href: `${root}/project`,
    },
    {
      id: "follow-up",
      label: "Follow-up delay",
      deltaDisplay: "+3 days",
      direction: "up",
      better: "down",
      detail: "Median 8 days from meeting to first contact, against 5 last quarter.",
      evidence: evidenceRef("northgate.followup", "observed_sequence", `${root}/people`, 31),
      href: `${root}/people`,
    },
  ];

  const alerts: AlertItem[] = [
    {
      id: "mispriced-two-room",
      severity: "warning",
      title: "Two-room units are looked at and not bought",
      detail:
        "A-402 has entered 9 comparisons and won 2, losing to B-301 seven times. The two are 4 m² and one floor apart, priced €12,000 apart.",
      evidence: evidenceRef("northgate.compare", "statistical_association", `${root}/project`, 9),
      actionLabel: "Open unit comparison",
      actionHref: `${root}/project`,
    },
    {
      id: "stalled",
      severity: "warning",
      title: "3 deals past the usual time in stage",
      detail: "All three sit at offer, beyond this project's own 80th percentile of 21 days.",
      evidence: evidenceRef("northgate.stalled", "observed_sequence", `${root}/flow`, 3),
      actionLabel: "Review stalled deals",
      actionHref: `${root}/flow`,
    },
    {
      id: "sold-favourite",
      severity: "info",
      title: "A-505 sold while an active buyer had it shortlisted",
      detail: "Viktória Halász favourited it on 9 August. Her meeting is on 27 August.",
      evidence: evidenceRef("northgate.a505", "observed_sequence", `${root}/people`, 1),
      actionLabel: "Open the buyer",
      actionHref: `${root}/people`,
    },
  ];

  const briefing: AiBriefing = {
    heading: "What changed this quarter",
    statements: [
      {
        text: "Sales slowed by 22%, and the whole loss sits between viewing and offer: viewings held steady at 46, offers fell from 17 to 12.",
        tier: "observed_sequence",
        evidence: evidenceRef("northgate.brief.1", "observed_sequence", `${root}/flow`, 46),
      },
      {
        text: "Two-room units take 2.1× their share of attention and convert at half the project average — the pattern of a segment priced above what buyers will pay for it.",
        tier: "statistical_association",
        evidence: evidenceRef(
          "northgate.brief.2",
          "statistical_association",
          `${root}/project`,
          61,
        ),
      },
      {
        text: "Median follow-up after a meeting is now 8 days, up from 5. Meetings followed up within 3 days reach an offer roughly twice as often (n = 31).",
        tier: "statistical_association",
        evidence: evidenceRef("northgate.brief.3", "statistical_association", `${root}/people`, 31),
      },
    ],
    generatorVersion: "briefing-1.0.0",
    generatedAt: context.generatedAt,
    caveat: null,
  };

  const actions: ActionItem[] = [
    {
      id: "review-two-room-pricing",
      label: "Review two-room pricing",
      description: "Open the segment with its comparison losses and price gaps.",
      href: `${root}/project`,
      emphasis: "primary",
    },
    {
      id: "chase-stalled",
      label: "Chase 3 stalled offers",
      description: "All beyond this project's 80th percentile time in stage.",
      href: `${root}/flow`,
      emphasis: "secondary",
    },
  ];

  const dataHealth: DataHealth = {
    completeness: ok({
      metricId: "exec.data_completeness",
      label: "Data completeness",
      display: percent(0.86, locale),
      raw: 0.86,
      qualifier: "of expected inputs",
      sampleSize: 46,
      minimumSampleSize: 5,
      comparison: comparison("previous period", "+4%", "up", "up"),
      drillHref: `${root}/people`,
    }),
    sourcesPresent: ["WEBIRIS", "Showroom", "CRM", "Catalogue"],
    sourcesMissing: [],
    note: "6 of 46 meetings have no recorded outcome, so conversion is a lower bound.",
  };

  return {
    context,
    verdict,
    headline,
    funnel,
    briefing,
    changes,
    alerts,
    actions,
    dataHealth,
  };
}

/* --- Riverside: no CRM ---------------------------------------------------- */

const NO_CRM = "The CRM is not connected, so outcomes below the meeting are unknown.";

function riverside(context: ViewContext): ExecutiveOverview {
  const { root, locale } = base(context);

  return {
    context,
    verdict: {
      state: "unknown",
      headline:
        "No verdict is possible for Riverside Walk: without the CRM, Observer can see the meetings but not what came of them.",
      supporting:
        "38 meetings and 214 online visitors are recorded this period. Connect the CRM to see offers, reservations and sales.",
      evidence: evidenceRef("riverside.verdict", "observed_sequence", `${root}/people`, 38),
    },
    headline: [
      unavailable("exec.units_sold", "Units Sold", 1, NO_CRM),
      unavailable("exec.revenue", "Revenue", 1, NO_CRM),
      unavailable("exec.avg_days_to_close", "Average Days to Close", 10, NO_CRM),
      unavailable("exec.active_buyers", "Active Buyers", 1, NO_CRM),
    ],
    funnel: [
      {
        label: "Viewing to Offer",
        fromCount: 38,
        toCount: null,
        metric: unavailable("flow.viewing_to_offer", "Viewing to Offer", 20, NO_CRM),
      },
      {
        label: "Offer to Reservation",
        fromCount: null,
        toCount: null,
        metric: unavailable("flow.offer_to_reservation", "Offer to Reservation", 15, NO_CRM),
      },
      {
        label: "Reservation to Sale",
        fromCount: null,
        toCount: null,
        metric: unavailable("flow.reservation_to_sale", "Reservation to Sale", 10, NO_CRM),
      },
    ],
    briefing: {
      heading: "What can be said without the CRM",
      statements: [
        {
          text: "38 meetings were held this period, and 214 people visited the project online.",
          tier: "observed_sequence",
          evidence: evidenceRef("riverside.brief.1", "observed_sequence", `${root}/people`, 38),
        },
        {
          text: "South-facing units above the third floor take 1.7× their share of attention. Whether that converts cannot be seen from here.",
          tier: "statistical_association",
          evidence: evidenceRef(
            "riverside.brief.2",
            "statistical_association",
            `${root}/project`,
            91,
          ),
        },
      ],
      generatorVersion: "briefing-1.0.0",
      generatedAt: context.generatedAt,
      caveat: "The CRM is disconnected. Nothing below the meeting is included in this summary.",
    },
    changes: [],
    alerts: [
      {
        id: "crm-missing",
        severity: "critical",
        title: "The CRM is not connected",
        detail:
          "Offers, reservations and sales are invisible, so this project has no funnel and no sell-out forecast.",
        evidence: null,
        actionLabel: "Connect a CRM",
        actionHref: "/madspace",
      },
    ],
    actions: [
      {
        id: "connect-crm",
        label: "Connect a CRM",
        description: "Unlocks the funnel, the forecast and every outcome metric.",
        href: "/madspace",
        emphasis: "primary",
      },
    ],
    dataHealth: {
      completeness: ok({
        metricId: "exec.data_completeness",
        label: "Data completeness",
        display: percent(0.52, locale),
        raw: 0.52,
        qualifier: "of expected inputs",
        sampleSize: 38,
        minimumSampleSize: 5,
        drillHref: `${root}/people`,
      }),
      sourcesPresent: ["WEBIRIS", "Showroom", "Catalogue"],
      sourcesMissing: ["CRM"],
      note: "Roughly half the journey is invisible while the CRM is disconnected.",
    },
  };
}

/* --- Kingsford: too new to judge ------------------------------------------ */

function kingsford(context: ViewContext): ExecutiveOverview {
  const { root, locale, currency } = base(context);
  const thin = "Fewer than 20 meetings — shown as a raw figure, not as a verdict.";

  return {
    context,
    verdict: {
      state: "unknown",
      headline: "Kingsford Yard has been live for three weeks and has held 7 meetings.",
      supporting:
        "That is too few to read as a trend. Figures are shown as raw counts until 20 meetings are on record.",
      evidence: evidenceRef("kingsford.verdict", "observed_sequence", `${root}/people`, 7),
    },
    headline: [
      insufficient(
        {
          metricId: "exec.units_sold",
          label: "Units Sold",
          display: count(1, locale),
          raw: 1,
          sampleSize: 1,
          minimumSampleSize: 1,
          drillHref: `${root}/flow`,
        },
        "One sale is a fact, not a rate.",
      ),
      insufficient(
        {
          metricId: "exec.revenue",
          label: "Revenue",
          display: compactMoney(310_000, currency, locale),
          raw: 310_000,
          qualifier: "of £8.4M inventory",
          sampleSize: 1,
          minimumSampleSize: 1,
          drillHref: `${root}/flow`,
        },
        "One sale is a fact, not a rate.",
      ),
      unavailable(
        "exec.avg_days_to_close",
        "Average Days to Close",
        10,
        "Fewer than 10 completed sales — percentiles would be misleading.",
      ),
      insufficient(
        {
          metricId: "exec.active_buyers",
          label: "Active Buyers",
          display: count(6, locale),
          raw: 6,
          qualifier: "in the last 28 days",
          sampleSize: 6,
          minimumSampleSize: 1,
          drillHref: `${root}/people`,
        },
        thin,
      ),
    ],
    funnel: [
      {
        label: "Viewing to Offer",
        fromCount: 7,
        toCount: 2,
        metric: insufficient(
          {
            metricId: "flow.viewing_to_offer",
            label: "Viewing to Offer",
            display: "2 of 7",
            raw: 2 / 7,
            sampleSize: 7,
            minimumSampleSize: 20,
            drillHref: `${root}/flow`,
          },
          thin,
        ),
      },
      {
        label: "Offer to Reservation",
        fromCount: 2,
        toCount: 1,
        metric: insufficient(
          {
            metricId: "flow.offer_to_reservation",
            label: "Offer to Reservation",
            display: "1 of 2",
            raw: 0.5,
            sampleSize: 2,
            minimumSampleSize: 15,
            drillHref: `${root}/flow`,
          },
          thin,
        ),
      },
      {
        label: "Reservation to Sale",
        fromCount: 1,
        toCount: 1,
        metric: insufficient(
          {
            metricId: "flow.reservation_to_sale",
            label: "Reservation to Sale",
            display: "1 of 1",
            raw: 1,
            sampleSize: 1,
            minimumSampleSize: 10,
            drillHref: `${root}/flow`,
          },
          thin,
        ),
      },
    ],
    briefing: {
      heading: "Too early for a summary",
      statements: [
        {
          text: "7 meetings and 1 sale are on record. No pattern can be separated from chance at this volume.",
          tier: "observed_sequence",
          evidence: evidenceRef("kingsford.brief.1", "observed_sequence", `${root}/people`, 7),
        },
      ],
      generatorVersion: "briefing-1.0.0",
      generatedAt: context.generatedAt,
      caveat: "Summaries become useful at around 20 meetings.",
    },
    changes: [],
    alerts: [
      {
        id: "no-webiris",
        severity: "info",
        title: "WEBIRIS is not connected",
        detail: "Online behaviour and the cross-channel journey are unavailable for this project.",
        evidence: null,
        actionLabel: "Connect WEBIRIS",
        actionHref: "/madspace",
      },
    ],
    actions: [],
    dataHealth: {
      completeness: insufficient(
        {
          metricId: "exec.data_completeness",
          label: "Data completeness",
          display: percent(0.71, locale),
          raw: 0.71,
          qualifier: "of expected inputs",
          sampleSize: 7,
          minimumSampleSize: 5,
          drillHref: `${root}/people`,
        },
        thin,
      ),
      sourcesPresent: ["Showroom", "Catalogue"],
      sourcesMissing: ["WEBIRIS", "CRM"],
      note: "Two of four sources are connected.",
    },
  };
}

const BUILDERS: Record<string, (context: ViewContext) => ExecutiveOverview> = {
  prj_northgate01: northgate,
  prj_riversidew1: riverside,
  prj_beta0000001: kingsford,
};

export function buildExecutiveOverview(context: ViewContext): ExecutiveOverview {
  const builder = BUILDERS[context.project.id] ?? kingsford;
  return builder(context);
}

/** Exposed for the money formatter used by the units read model. */
export { money };
