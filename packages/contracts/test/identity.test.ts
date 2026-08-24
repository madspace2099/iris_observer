import { describe, expect, it } from "vitest";
import { ContactIdSchema, MeetingIdSchema, TenantIdSchema } from "../src/ids";
import { ContactSchema, LeadSchema } from "../src/identity";
import { MeetingParticipantSchema, STAGE_OWNER, JOURNEY_STAGES } from "../src/engagement";

const CONTACT = "cnt_9a2b4c6d8e";
const MEETING = "mtg_1122334455";
const TENANT = "tnt_aabbccdd11";

describe("identifiers", () => {
  it("accepts a correctly prefixed identifier", () => {
    expect(ContactIdSchema.safeParse(CONTACT).success).toBe(true);
  });

  it("refuses an identifier from a different entity", () => {
    // The whole point of branding: a meeting id must not pass as a contact id.
    expect(ContactIdSchema.safeParse(MEETING).success).toBe(false);
    expect(MeetingIdSchema.safeParse(CONTACT).success).toBe(false);
  });

  it("refuses an unprefixed or malformed identifier", () => {
    expect(TenantIdSchema.safeParse("aabbccdd11").success).toBe(false);
    expect(TenantIdSchema.safeParse("tnt_SHOUTING").success).toBe(false);
    expect(TenantIdSchema.safeParse("tnt_short").success).toBe(false);
  });
});

describe("contact", () => {
  it("carries no personal data", () => {
    // PII lives in ContactPii behind its own permission. A strict object is
    // what makes that structural rather than a matter of remembering.
    const withEmail = ContactSchema.safeParse({
      id: CONTACT,
      tenantId: TENANT,
      createdAt: "2026-08-24T10:00:00.000+02:00",
      originSource: "webiris",
      email: "someone@example.com",
    });
    expect(withEmail.success).toBe(false);
  });

  it("is tenant-scoped", () => {
    const withoutTenant = ContactSchema.safeParse({
      id: CONTACT,
      createdAt: "2026-08-24T10:00:00.000+02:00",
      originSource: "webiris",
    });
    expect(withoutTenant.success).toBe(false);
  });
});

describe("lead", () => {
  const base = {
    id: "led_5566778899",
    tenantId: TENANT,
    projectId: "prj_istertower1",
    contactId: CONTACT,
    submittedAt: "2026-08-24T10:00:00.000+02:00",
    source: "webiris" as const,
    visitorId: "vis_abcdef1234",
  };

  it("requires a recorded consent state", () => {
    expect(LeadSchema.safeParse(base).success).toBe(false);
  });

  it("records which consent text version was shown", () => {
    const parsed = LeadSchema.safeParse({
      ...base,
      consent: {
        behaviouralLinking: true,
        marketing: false,
        textVersion: "hu-2026-06",
        capturedAt: "2026-08-24T10:00:00.000+02:00",
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("meeting participants", () => {
  it("supports a couple", () => {
    const primary = MeetingParticipantSchema.safeParse({
      id: "mpt_0001aaaabb",
      meetingId: MEETING,
      role: "primary",
      contactId: CONTACT,
    });
    const partner = MeetingParticipantSchema.safeParse({
      id: "mpt_0002aaaabb",
      meetingId: MEETING,
      role: "additional",
      contactId: "cnt_1234567890",
    });
    expect(primary.success && partner.success).toBe(true);
  });

  it("supports a walk-in who gave no details", () => {
    const anonymous = MeetingParticipantSchema.safeParse({
      id: "mpt_0003aaaabb",
      meetingId: MEETING,
      role: "unidentified",
      contactId: null,
    });
    expect(anonymous.success).toBe(true);
  });

  it("refuses an unidentified participant who somehow has a contact", () => {
    const contradiction = MeetingParticipantSchema.safeParse({
      id: "mpt_0004aaaabb",
      meetingId: MEETING,
      role: "unidentified",
      contactId: CONTACT,
    });
    expect(contradiction.success).toBe(false);
  });

  it("refuses an identified participant with no contact", () => {
    const contradiction = MeetingParticipantSchema.safeParse({
      id: "mpt_0005aaaabb",
      meetingId: MEETING,
      role: "primary",
      contactId: null,
    });
    expect(contradiction.success).toBe(false);
  });
});

describe("journey ownership", () => {
  it("assigns an owner to every stage", () => {
    for (const stage of JOURNEY_STAGES) {
      expect(STAGE_OWNER[stage], `${stage} has no owning system`).toBeDefined();
    }
  });

  it("splits the ladder across systems, which is why the join is the product", () => {
    const owners = new Set(JOURNEY_STAGES.map((s) => STAGE_OWNER[s]));
    expect(owners.size).toBeGreaterThan(1);
    expect(STAGE_OWNER.anonymous_visitor).toBe("webiris");
    expect(STAGE_OWNER.showroom_attended).toBe("showroom");
    expect(STAGE_OWNER.purchase).toBe("crm");
  });
});
