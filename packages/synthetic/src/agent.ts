import {
  AgentIdSchema,
  ContactIdSchema,
  MeetingIdSchema,
  UnitIdSchema,
  type MeetingId,
  type PreMeetingBrief,
  type UnitId,
} from "@observer/contracts";
import type {
  AgentOverview,
  EvidenceRef,
  FollowUpItem,
  PreMeetingBriefView,
  UnitLabel,
  UpcomingMeeting,
  ViewContext,
} from "@observer/readmodels";
import { comparison, count, days, evidenceRef, money, ok, percent, unavailable } from "./format";
import { UNITS, unitById } from "./world";

/**
 * The sales agent's surfaces: their Overview, and the pre-meeting brief.
 *
 * This is the half of the product the agent actually wants, and therefore the
 * half that decides whether any data arrives at all (docs/01-foundation §1.2).
 * Two rules shape everything here:
 *
 *  - **No scoreboard.** The agent's own figures appear; their colleagues' do
 *    not. The moment this screen ranks people, the outcomes stop being logged
 *    and every other number in the product decays with them.
 *  - **Nothing from this surface may reach a buyer-visible display** (ADR-0018).
 */

export const VIKTORIA_MEETING_ID: MeetingId = MeetingIdSchema.parse("mtg_viktoria0827");
export const COUPLE_MEETING_ID: MeetingId = MeetingIdSchema.parse("mtg_bartos00829");

/** Fixture identifiers are parsed, so a typo fails at module load. */
const unit = (value: string): UnitId => UnitIdSchema.parse(value);

const CONSENT_VERSION = "hu-2026-06";

function ev(seed: string, tier: Parameters<typeof evidenceRef>[1], href: string, n: number) {
  return evidenceRef(seed, tier, href, n);
}

/* --- the brief ------------------------------------------------------------ */

/**
 * Viktória's brief, as the scenario in `docs/08-scenarios.md` specifies it.
 *
 * The one finding that justifies the whole product is in `recommended`: she
 * favourited A-505 on 9 August and it sold on the 25th. Her agent learns that
 * from the brief three days before the meeting, rather than from her, in the
 * room, in front of the screen.
 */
function viktoriaBrief(
  context: ViewContext,
  evidence: Record<string, EvidenceRef>,
): PreMeetingBrief {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  void root;

  return {
    context: {
      meetingId: VIKTORIA_MEETING_ID,
      projectId: context.project.id,
      tenantId: context.tenant.id,
      agentId: AgentIdSchema.parse("agt_monika0001"),
      scheduledFor: "2026-08-27T10:00:00.000+02:00",
      contactIds: [ContactIdSchema.parse("cnt_viktoria001")],
      isReturningBuyer: false,
      previousMeetingCount: 0,
      lastMeetingAt: null,
    },
    generatedAt: context.generatedAt,
    generatorVersion: "brief-1.0.0",

    observed: {
      onlineActivity: {
        sessionCount: 3,
        firstSeenAt: "2026-08-02T18:12:00.000+02:00",
        lastSeenAt: "2026-08-21T21:40:00.000+02:00",
        daysSinceLastVisit: 3,
        sessionDates: [
          "2026-08-02T18:12:00.000+02:00",
          "2026-08-09T20:05:00.000+02:00",
          "2026-08-21T21:40:00.000+02:00",
        ],
        // She never volunteered any of this; it was attached after she gave
        // her details, with her consent. The agent should know that.
        includesBackLinkedActivity: true,
      },
      unitInterest: [
        {
          unitId: unit("unt_a402000001"),
          uniqueViews: 2,
          meaningfulDwellMs: 94_000,
          favourited: true,
          channels: ["webiris"],
          lastSeenAt: "2026-08-21T21:35:00.000+02:00",
          materialsOpened: ["floorplan"],
          sharedAt: null,
        },
        {
          unitId: unit("unt_a505000003"),
          uniqueViews: 2,
          meaningfulDwellMs: 121_000,
          favourited: true,
          channels: ["webiris"],
          lastSeenAt: "2026-08-21T21:22:00.000+02:00",
          materialsOpened: ["floorplan", "brochure"],
          sharedAt: null,
        },
        {
          unitId: unit("unt_b301000002"),
          uniqueViews: 2,
          meaningfulDwellMs: 41_000,
          favourited: false,
          channels: ["webiris"],
          lastSeenAt: "2026-08-09T20:18:00.000+02:00",
          materialsOpened: [],
          sharedAt: null,
        },
      ],
      compareSets: [
        {
          unitIds: [unit("unt_a402000001"), unit("unt_a505000003")],
          keptUnitId: unit("unt_a505000003"),
          occurredAt: "2026-08-21T21:30:00.000+02:00",
          channel: "webiris",
        },
      ],
      filters: [
        {
          criterion: "orientation",
          value: "South",
          occurrences: 4,
          lastAppliedAt: "2026-08-21T21:28:00.000+02:00",
          lastResultCount: 6,
        },
        {
          criterion: "rooms",
          value: "2",
          occurrences: 5,
          lastAppliedAt: "2026-08-21T21:28:00.000+02:00",
          lastResultCount: 11,
        },
      ],
      // She never set a price filter. A range guessed from the units she
      // opened would be an inference, and an agent told "her budget is
      // 210–230" will negotiate on it.
      priceRange: null,
      sharedMaterials: [],
      statements: [
        {
          text: "Three visits between 2 and 21 August, the most recent three days ago.",
          tier: "observed_sequence",
          evidenceId: evidence["sessions"]!.evidenceId,
        },
        {
          text: "Two units shortlisted, A-402 and A-505, both two-room and south-facing.",
          tier: "observed_sequence",
          evidenceId: evidence["favourites"]!.evidenceId,
        },
        {
          text: "In her last visit she compared A-402 against A-505 and kept A-505.",
          tier: "observed_sequence",
          evidenceId: evidence["compare"]!.evidenceId,
        },
      ],
    },

    interpretation: {
      preferredAttributes: [
        {
          attribute: "Orientation",
          value: "South",
          supportCount: 4,
          totalObservations: 5,
          confidence: {
            level: "moderate",
            reason:
              "South-facing in four of five filter applications, and both shortlisted units face south.",
            sampleSize: 5,
            minSampleRequired: 3,
          },
        },
        {
          attribute: "Rooms",
          value: "2",
          supportCount: 5,
          totalObservations: 5,
          confidence: {
            level: "high",
            reason: "Every filter she applied and every unit she opened was two-room.",
            sampleSize: 5,
            minSampleRequired: 3,
          },
        },
        {
          attribute: "Floor",
          value: "Upper (4 and above)",
          supportCount: 2,
          totalObservations: 3,
          confidence: {
            level: "low",
            reason:
              "Two of three units opened were on the fourth floor or above. She never filtered by floor.",
            sampleSize: 3,
            minSampleRequired: 3,
          },
        },
      ],
      statements: [
        {
          text: "Behaviour points consistently at a two-room, south-facing unit. Floor preference is weaker and she never filtered on it.",
          tier: "statistical_association",
          evidenceId: evidence["preferences"]!.evidenceId,
        },
      ],
    },

    recommended: {
      unitsToPrepare: [
        {
          unitId: unit("unt_a402000001"),
          available: true,
          reason: {
            text: "Shortlisted, viewed twice, floor plan opened. Still available at €214,000.",
            tier: "observed_sequence",
            evidenceId: evidence["a402"]!.evidenceId,
          },
        },
        {
          unitId: unit("unt_a204000005"),
          available: true,
          reason: {
            text: "Two-room and closest in size to A-505 among what remains, though it faces north.",
            tier: "observed_sequence",
            evidenceId: evidence["alternatives"]!.evidenceId,
          },
        },
      ],
      previouslyInterestedNowUnavailable: [unit("unt_a505000003")],
      changesSinceLastVisit: [
        {
          text: "A-505, the unit she kept in her comparison, sold on 25 August — four days after her last visit.",
          tier: "observed_sequence",
          evidenceId: evidence["a505sold"]!.evidenceId,
        },
      ],
      clarificationQuestions: [
        {
          question:
            "A-505 has gone. Was the south-facing view the deciding factor, or the extra three square metres?",
          rationale: {
            text: "She kept A-505 over A-402 in a direct comparison; the two differ mainly in orientation angle and 3 m².",
            tier: "observed_sequence",
            evidenceId: evidence["compare"]!.evidenceId,
          },
        },
        {
          question:
            "Is the fourth floor or above a requirement, or did it happen to be where she looked?",
          rationale: {
            text: "Two of three units opened were on the fourth floor or above, but she never applied a floor filter.",
            tier: "statistical_association",
            evidenceId: evidence["preferences"]!.evidenceId,
          },
        },
      ],
      statements: [
        {
          text: "Lead with A-402 and be ready to explain the A-505 loss before she asks.",
          tier: "observed_sequence",
          evidenceId: evidence["a505sold"]!.evidenceId,
        },
      ],
    },

    dataHealth: {
      completeness: 0.75,
      sourcesPresent: ["webiris", "showroom", "catalogue"],
      sourcesMissing: ["crm"],
      missing: [
        {
          what: "No CRM record is linked to this contact yet",
          consequence: "Any earlier contact by a colleague would not appear here.",
        },
      ],
    },
  };
}

function unitLabel(unitId: string, context: ViewContext): UnitLabel {
  const unit = unitById(unitId);
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  if (unit === undefined) {
    return {
      unitId,
      code: unitId,
      summary: "Unknown unit",
      priceDisplay: null,
      statusLabel: "Unknown",
      available: false,
      href: `${root}/project`,
    };
  }
  const statusLabel =
    unit.status === "available" ? "Available" : unit.status === "reserved" ? "Reserved" : "Sold";
  return {
    unitId,
    code: unit.code,
    summary: `${unit.rooms} rooms · ${unit.areaSqm} m² · floor ${unit.floor} · ${unit.orientation}`,
    priceDisplay: money(unit.price, context.project.currency, context.project.locale),
    statusLabel,
    available: unit.status === "available",
    href: `${root}/project`,
  };
}

export function buildPreMeetingBrief(
  context: ViewContext,
  meetingId: MeetingId,
): PreMeetingBriefView | null {
  if (meetingId !== VIKTORIA_MEETING_ID) return null;

  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const timeline = `${root}/people`;

  const refs: Record<string, EvidenceRef> = {
    sessions: ev("viktoria.sessions", "observed_sequence", timeline, 3),
    favourites: ev("viktoria.favourites", "observed_sequence", timeline, 2),
    compare: ev("viktoria.compare", "observed_sequence", timeline, 1),
    preferences: ev("viktoria.preferences", "statistical_association", timeline, 5),
    a402: ev("viktoria.a402", "observed_sequence", `${root}/project`, 2),
    a505sold: ev("viktoria.a505sold", "observed_sequence", `${root}/project`, 1),
    alternatives: ev("viktoria.alternatives", "observed_sequence", `${root}/project`, 4),
  };

  const brief = viktoriaBrief(context, refs);

  const referenced = new Set<string>([
    ...brief.observed.unitInterest.map((u) => u.unitId),
    ...brief.recommended.unitsToPrepare.map((u) => u.unitId),
    ...brief.recommended.previouslyInterestedNowUnavailable,
    ...brief.observed.compareSets.flatMap((c) => c.unitIds),
  ]);

  const units: Record<string, UnitLabel> = {};
  for (const unitId of referenced) units[unitId] = unitLabel(unitId, context);

  const evidence: Record<string, EvidenceRef> = {};
  for (const ref of Object.values(refs)) evidence[ref.evidenceId] = ref;

  return {
    context,
    brief,
    participantNames: ["Viktória Halász"],
    units,
    evidence,
    meetingHref: `${root}/meetings/${meetingId}`,
    contactHref: `${root}/people`,
  };
}

/* --- the agent's overview -------------------------------------------------- */

export function buildAgentOverview(context: ViewContext): AgentOverview {
  const root = `/${context.tenant.slug}/${context.project.slug}`;
  const hasShowroom = context.project.connectedSources.includes("showroom");

  const upcoming: readonly UpcomingMeeting[] = hasShowroom
    ? [
        {
          meetingId: VIKTORIA_MEETING_ID,
          scheduledFor: "2026-08-27T10:00:00.000+02:00",
          whenLabel: "Thursday, 27 August · 10:00",
          participantNames: ["Viktória Halász"],
          isReturningBuyer: false,
          headline:
            "Two-room, south-facing. Shortlisted A-505, which sold on Monday — have the answer ready.",
          briefHref: `${root}/meetings/${VIKTORIA_MEETING_ID}`,
          briefReady: true,
          briefCaveat: null,
        },
        {
          meetingId: COUPLE_MEETING_ID,
          scheduledFor: "2026-08-29T14:30:00.000+02:00",
          whenLabel: "Saturday, 29 August · 14:30",
          participantNames: ["Daniel Bartoš", "Eva Bartošová"],
          isReturningBuyer: true,
          headline: "Third visit as a couple. Two offers discussed, none made.",
          briefHref: `${root}/meetings/${COUPLE_MEETING_ID}`,
          briefReady: false,
          briefCaveat:
            "No online history is linked for either of them, so this brief covers showroom visits only.",
        },
      ]
    : [];

  const followUps: readonly FollowUpItem[] = [
    {
      contactId: "cnt_danielpair1",
      displayName: "Daniel and Eva Bartoš",
      lastMeetingLabel: "8 August",
      daysSinceMeeting: 16,
      reason: "Shortlisted two units, no contact since the meeting.",
      href: `${root}/people`,
      urgency: "overdue",
    },
  ];

  return {
    context,
    verdict: {
      state: "watch",
      headline: "Two meetings this week, and one buyer has been waiting 16 days for a reply.",
      supporting: "Your briefs are ready for Thursday. Daniel and Eva are the overdue one.",
      evidence: ev("agent.verdict", "observed_sequence", `${root}/people`, 2),
    },
    upcoming,
    followUps,
    personal: [
      ok({
        metricId: "people.meetings_by_agent",
        label: "Your meetings",
        display: count(14, context.project.locale),
        raw: 14,
        qualifier: "this quarter",
        sampleSize: 14,
        minimumSampleSize: 1,
        comparison: comparison("your previous quarter", "+2", "up", "up"),
        drillHref: `${root}/people`,
      }),
      ok({
        metricId: "unit.shares",
        label: "Summaries sent",
        display: count(9, context.project.locale),
        raw: 9,
        qualifier: "of 14 meetings",
        sampleSize: 14,
        minimumSampleSize: 1,
        comparison: comparison("your previous quarter", "+4", "up", "up"),
        drillHref: `${root}/people`,
      }),
      ok({
        metricId: "people.follow_up_delay",
        label: "Your follow-up delay",
        display: days(6),
        raw: 6,
        qualifier: "median, 80th percentile 13",
        sampleSize: 14,
        minimumSampleSize: 15,
        comparison: comparison("your previous quarter", "−1 day", "down", "down"),
        drillHref: `${root}/people`,
      }),
      unavailable(
        "people.agent_conversion",
        "Your conversion",
        20,
        "Fewer than 20 meetings for this agent — shown as a raw figure, not as a verdict.",
      ),
    ],
    briefing: {
      heading: "Before Thursday",
      statements: [
        {
          text: "Viktória Halász kept A-505 over A-402 in a direct comparison. A-505 sold on 25 August.",
          tier: "observed_sequence",
          evidence: ev("viktoria.a505sold", "observed_sequence", `${root}/project`, 1),
        },
        {
          text: "A-402 remains available and is the closest match to what she has been filtering for.",
          tier: "observed_sequence",
          evidence: ev("viktoria.a402", "observed_sequence", `${root}/project`, 2),
        },
      ],
      generatorVersion: "briefing-1.0.0",
      generatedAt: context.generatedAt,
      caveat: null,
    },
    dataHealth: {
      completeness: ok({
        metricId: "exec.data_completeness",
        label: "Your data completeness",
        display: percent(0.93, context.project.locale),
        raw: 0.93,
        qualifier: "of your meetings fully recorded",
        sampleSize: 14,
        minimumSampleSize: 5,
        drillHref: `${root}/people`,
      }),
      sourcesPresent: ["WEBIRIS", "Showroom", "Catalogue"],
      sourcesMissing: [],
      note: "One of your 14 meetings has no recorded outcome.",
    },
  };
}

/** Units the brief can offer as alternatives. Exported for tests. */
export const AVAILABLE_TWO_ROOM = UNITS.filter(
  (u) => u.rooms === 2 && u.status === "available",
).map((u) => u.id);

export { CONSENT_VERSION };
