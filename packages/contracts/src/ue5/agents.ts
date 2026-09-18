import { z } from "zod";
import { SubjectReferenceSchema } from "./ingestion";
import { WireInstantSchema } from "./wire";

/**
 * THE PRESENTER ROSTER — who the `agent_id` values are, on its own endpoint. PROPOSED.
 *
 * Every showroom session must show the name of the person who presented it. An
 * event cannot carry that name: events are immutable behavioural facts and hold
 * no personal data, an agent's name included. So the name travels once, beside
 * the events and never inside them, and Observer keeps it in the one table of
 * the ingestion domain that holds a person's name.
 *
 * ## Why a showroom reports it rather than an administrator typing it
 *
 * The showroom already knows who signed in to present. Asking an administrator
 * to retype that list is a second copy that goes stale the day somebody joins.
 * Administration can still name or rename a presenter, and its word stands: a
 * roster never overwrites a name an administrator set.
 *
 * ## What is deliberately not here
 *
 * No email, no phone number, no employer, no photograph. A display name is what
 * a session needs in order to be read, and nothing else is asked for. Like a
 * heartbeat, a roster writes to the source's project record and **never** to
 * `analytics_events`.
 */

/** The most presenters one report may name. A project has a handful. */
export const AGENT_ROSTER_MAX_ENTRIES = 100;

/**
 * A name as a person would write it: no control characters, no whitespace at
 * either end, so an all-blank name cannot be stored and shown as nothing.
 */
const DISPLAY_NAME = /^[^\s\p{Cc}](?:[^\p{Cc}]*[^\s\p{Cc}])?$/u;

export const AgentRosterEntrySchema = z.strictObject({
  /** Exactly the value this showroom sends as `agent_id` on its events. */
  agent_id: SubjectReferenceSchema,
  display_name: z
    .string()
    .min(1)
    .max(120)
    .regex(DISPLAY_NAME, "must be a name with no control characters or surrounding whitespace"),
});
export type AgentRosterEntry = z.infer<typeof AgentRosterEntrySchema>;

export const AgentRosterRequestSchema = z.strictObject({
  sent_at: WireInstantSchema,
  agents: z.array(AgentRosterEntrySchema).min(1).max(AGENT_ROSTER_MAX_ENTRIES),
});
export type AgentRosterRequest = z.infer<typeof AgentRosterRequestSchema>;

export const AgentRosterResponseSchema = z.strictObject({
  status: z.literal("ok"),
  /**
   * How many of the names sent are now the ones Observer shows.
   *
   * Lower than the number sent is not a failure: a presenter an administrator
   * has named keeps that name, and is not counted.
   */
  recorded: z.int().min(0),
});
export type AgentRosterResponse = z.infer<typeof AgentRosterResponseSchema>;
