import { z } from "zod";

/**
 * Identifiers are opaque, prefixed and branded.
 *
 * Prefixed, because an identifier that appears in a log line, a CRM
 * cross-reference or a support ticket should say what it is without a lookup.
 * Branded, because the compiler must refuse `ContactId` where `MeetingId` is
 * expected — the journey model joins six entity kinds and a silent mix-up
 * would surface as a wrong number on a dashboard rather than as an error.
 */
const BODY = "[0-9a-z]{8,40}";

function id<Brand extends string>(prefix: string) {
  return z
    .string()
    .regex(new RegExp(`^${prefix}_${BODY}$`), `must be a ${prefix}_ identifier`)
    .brand<Brand>();
}

/* --- tenancy ------------------------------------------------------------ */

export const TenantIdSchema = id<"TenantId">("tnt");
export const ProjectIdSchema = id<"ProjectId">("prj");
export const OrganisationIdSchema = id<"OrganisationId">("org");
export const AgentIdSchema = id<"AgentId">("agt");
export const InstallationIdSchema = id<"InstallationId">("ins");
export const DeviceIdSchema = id<"DeviceId">("dev");

/* --- people ------------------------------------------------------------- */

/**
 * A browser or app that has not identified itself. Scoped to a tenant, never
 * global: the same person browsing two developers' sites is two visitors, and
 * that is the correct answer, not a limitation.
 */
export const AnonymousVisitorIdSchema = id<"AnonymousVisitorId">("vis");
export const OnlineSessionIdSchema = id<"OnlineSessionId">("oss");
export const ContactIdSchema = id<"ContactId">("cnt");
export const ContactIdentityIdSchema = id<"ContactIdentityId">("cid");
export const LeadIdSchema = id<"LeadId">("led");
export const ProjectContactIdSchema = id<"ProjectContactId">("pct");

/* --- meetings and commerce ---------------------------------------------- */

export const MeetingIdSchema = id<"MeetingId">("mtg");
export const MeetingParticipantIdSchema = id<"MeetingParticipantId">("mpt");
export const DealIdSchema = id<"DealId">("del");
export const UnitIdSchema = id<"UnitId">("unt");

/* --- observer's own records --------------------------------------------- */

export const ObservationIdSchema = id<"ObservationId">("obs");
export const EvidenceIdSchema = id<"EvidenceId">("evd");

export type TenantId = z.infer<typeof TenantIdSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type OrganisationId = z.infer<typeof OrganisationIdSchema>;
export type AgentId = z.infer<typeof AgentIdSchema>;
export type InstallationId = z.infer<typeof InstallationIdSchema>;
export type DeviceId = z.infer<typeof DeviceIdSchema>;
export type AnonymousVisitorId = z.infer<typeof AnonymousVisitorIdSchema>;
export type OnlineSessionId = z.infer<typeof OnlineSessionIdSchema>;
export type ContactId = z.infer<typeof ContactIdSchema>;
export type ContactIdentityId = z.infer<typeof ContactIdentityIdSchema>;
export type LeadId = z.infer<typeof LeadIdSchema>;
export type ProjectContactId = z.infer<typeof ProjectContactIdSchema>;
export type MeetingId = z.infer<typeof MeetingIdSchema>;
export type MeetingParticipantId = z.infer<typeof MeetingParticipantIdSchema>;
export type DealId = z.infer<typeof DealIdSchema>;
export type UnitId = z.infer<typeof UnitIdSchema>;
export type ObservationId = z.infer<typeof ObservationIdSchema>;
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;

/** An instant, always with an offset. A timestamp without one is a bug. */
export const InstantSchema = z.iso.datetime({ offset: true });
export type Instant = z.infer<typeof InstantSchema>;
