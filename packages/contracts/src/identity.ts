import { z } from "zod";
import {
  AnonymousVisitorIdSchema,
  ContactIdentityIdSchema,
  ContactIdSchema,
  InstantSchema,
  LeadIdSchema,
  OnlineSessionIdSchema,
  ProjectContactIdSchema,
  ProjectIdSchema,
  TenantIdSchema,
} from "./ids";
import { SourceReferenceSchema, SourceSystemSchema } from "./sources";

/**
 * Identity architecture for the unified customer journey.
 *
 * Contracts only. Identity resolution is deliberately not implemented in this
 * milestone (ADR-0011) — the rules must be settled and reviewed before code
 * starts merging records that represent real people.
 *
 * The one rule that overrides every other consideration here: **identity never
 * crosses a tenant boundary.** A sales agency may work for competing
 * developers, and two developers may hold a record for the same buyer. Merging
 * those would be a commercial incident, not a feature.
 */

/* --- anonymous online activity ------------------------------------------ */

/**
 * A browser that has not identified itself, scoped to one tenant.
 *
 * Tenant-scoped rather than global: the same person browsing two developers'
 * sites is two visitors. That is the correct answer under the isolation rule,
 * not a shortcoming of the model.
 */
export const AnonymousVisitorSchema = z.strictObject({
  id: AnonymousVisitorIdSchema,
  tenantId: TenantIdSchema,
  firstSeenAt: InstantSchema,
  lastSeenAt: InstantSchema,
  /**
   * Set once the visitor identifies and the link is permitted. Until then this
   * is null and the visitor contributes only to anonymous aggregates.
   */
  resolvedContactId: ContactIdSchema.nullable().default(null),
});
export type AnonymousVisitor = z.infer<typeof AnonymousVisitorSchema>;

/** One continuous visit. The unit of "how many times did they come back". */
export const OnlineSessionSchema = z.strictObject({
  id: OnlineSessionIdSchema,
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  visitorId: AnonymousVisitorIdSchema,
  startedAt: InstantSchema,
  endedAt: InstantSchema.nullable().default(null),
  /**
   * Whether this session happened before or after the person identified.
   * Pre-identification sessions are the ones that require a consent check
   * before they may be attached to a contact.
   */
  identifiedAtStart: z.boolean(),
});
export type OnlineSession = z.infer<typeof OnlineSessionSchema>;

/* --- the person --------------------------------------------------------- */

/**
 * A person, stable within one developer tenant, across every project of that
 * tenant and across both channels.
 *
 * Carries no personal data. Names, emails and phone numbers live in
 * `ContactPii`, behind a separate permission, so that the ordinary analytical
 * path — timelines, metrics, exports to the agency — never touches them.
 */
export const ContactSchema = z.strictObject({
  id: ContactIdSchema,
  tenantId: TenantIdSchema,
  createdAt: InstantSchema,
  /** How this person first became known. Never overwritten afterwards. */
  originSource: SourceSystemSchema,
  /**
   * Set when this record has been superseded by a merge. The record is kept
   * rather than deleted so that historical references still resolve, and so
   * that a mistaken merge can be undone.
   */
  mergedIntoContactId: ContactIdSchema.nullable().default(null),
  /** Erasure tombstone. See `docs/05-identity.md` on deletion. */
  erasedAt: InstantSchema.nullable().default(null),
});
export type Contact = z.infer<typeof ContactSchema>;

/**
 * Personal data, isolated on purpose.
 *
 * Kept in its own record with its own access rule so the separation is
 * structural rather than a matter of remembering to omit columns. Behavioural
 * events reference `contact_id` and never carry any of these fields.
 */
export const ContactPiiSchema = z.strictObject({
  contactId: ContactIdSchema,
  fullName: z.string().min(1).max(200).nullable().default(null),
  email: z.email().nullable().default(null),
  phone: z.string().min(3).max(40).nullable().default(null),
  preferredLanguage: z.string().min(2).max(10).nullable().default(null),
  updatedAt: InstantSchema,
});
export type ContactPii = z.infer<typeof ContactPiiSchema>;

/**
 * One way a contact can be recognised.
 *
 * Matching runs on `valueHash`, never on the raw value, so the resolution path
 * can operate in contexts where the plain address must not be present. The
 * hash is salted per tenant, which also makes it structurally impossible to
 * match a hash across tenants — the isolation rule enforced by arithmetic
 * rather than by a WHERE clause.
 */
export const CONTACT_IDENTITY_KINDS = ["email", "phone", "crm_record", "device"] as const;
export const ContactIdentityKindSchema = z.enum(CONTACT_IDENTITY_KINDS);
export type ContactIdentityKind = z.infer<typeof ContactIdentityKindSchema>;

export const ContactIdentitySchema = z.strictObject({
  id: ContactIdentityIdSchema,
  tenantId: TenantIdSchema,
  contactId: ContactIdSchema,
  kind: ContactIdentityKindSchema,
  /** Tenant-salted hash of the normalised value. */
  valueHash: z.string().min(16).max(128),
  observedFrom: SourceSystemSchema,
  firstSeenAt: InstantSchema,
  /**
   * When the person themselves proved this identity — clicked a confirmation
   * link, answered the phone, signed something. An unverified identity is
   * still useful for matching but must never be the sole basis for merging two
   * contacts or for sending marketing.
   */
  verifiedAt: InstantSchema.nullable().default(null),
});
export type ContactIdentity = z.infer<typeof ContactIdentitySchema>;

/* --- identification and consent ----------------------------------------- */

/**
 * The moment a visitor became a known person: a form submission, a booking, a
 * hand-off from the CRM.
 *
 * `Lead` is a product record rather than a status flag, because the funnel
 * needs its timestamp and its source, and because the consent captured at that
 * moment governs whether earlier anonymous activity may be attached to the
 * contact at all.
 */
export const LeadSchema = z.strictObject({
  id: LeadIdSchema,
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  contactId: ContactIdSchema,
  submittedAt: InstantSchema,
  source: SourceSystemSchema,
  /** Free-form channel label from the source, carried but never parsed. */
  channel: z.string().min(1).max(120).nullable().default(null),
  /** The visitor whose activity may be attached, subject to the consent below. */
  visitorId: AnonymousVisitorIdSchema.nullable().default(null),
  consent: z.strictObject({
    /** Whether behavioural history may be associated with this person. */
    behaviouralLinking: z.boolean(),
    /** Whether the contact may be included in marketing segments. */
    marketing: z.boolean(),
    /** Version of the consent text shown, so a claim can be reconstructed. */
    textVersion: z.string().min(1).max(64),
    capturedAt: InstantSchema,
  }),
});
export type Lead = z.infer<typeof LeadSchema>;

/**
 * A contact's relationship with one project.
 *
 * Separate from `Contact` because a person may be interested in several
 * projects of the same developer at once, with different agents, different
 * stages and different consent. Collapsing that into the contact makes
 * per-project reporting wrong the first time somebody looks at two projects.
 */
export const ProjectContactSchema = z.strictObject({
  id: ProjectContactIdSchema,
  tenantId: TenantIdSchema,
  projectId: ProjectIdSchema,
  contactId: ContactIdSchema,
  firstTouchAt: InstantSchema,
  lastTouchAt: InstantSchema,
  /** Which source first brought this person to this project. */
  firstTouchSource: SourceSystemSchema,
  references: z.array(SourceReferenceSchema).default([]),
});
export type ProjectContact = z.infer<typeof ProjectContactSchema>;

/* --- resolution, recorded rather than assumed --------------------------- */

/**
 * Why two records are believed to describe the same person.
 *
 * Stored as its own record so that every merge and every back-link to
 * anonymous history is explainable after the fact, reversible, and gradeable
 * by confidence. "The system decided" is not an acceptable answer when the
 * subject asks why their browsing history is attached to their name.
 */
export const IDENTITY_LINK_BASES = [
  /** The same browser submitted the form. Strongest online signal. */
  "same_device",
  /** Verified email match. */
  "verified_email",
  /** Verified phone match. */
  "verified_phone",
  /** Unverified contact detail match. Never sufficient alone for a merge. */
  "unverified_contact_detail",
  /** A CRM record maps to both. */
  "crm_reference",
  /** A person confirmed it. Always outranks an automatic basis. */
  "manual_confirmation",
] as const;
export const IdentityLinkBasisSchema = z.enum(IDENTITY_LINK_BASES);
export type IdentityLinkBasis = z.infer<typeof IdentityLinkBasisSchema>;

export const IdentityLinkSchema = z.strictObject({
  tenantId: TenantIdSchema,
  contactId: ContactIdSchema,
  basis: IdentityLinkBasisSchema,
  /**
   * Deterministic links follow from an exact, verifiable match. Probabilistic
   * ones are inferences, and the UI must never present them as fact.
   */
  deterministic: z.boolean(),
  linkedAt: InstantSchema,
  /** The lead whose consent permits the link, where one is required. */
  authorisedByLeadId: LeadIdSchema.nullable().default(null),
  /** Set when the link is withdrawn, on consent withdrawal or a bad merge. */
  revokedAt: InstantSchema.nullable().default(null),
  revokedReason: z.string().min(1).max(200).nullable().default(null),
});
export type IdentityLink = z.infer<typeof IdentityLinkSchema>;
