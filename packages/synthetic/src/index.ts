/**
 * `@observer/synthetic` — a deterministic implementation of the Observer
 * repository port.
 *
 * Exists so the product can be built, reviewed and tested at final quality
 * before a physical database exists. It is the only package that knows the
 * synthetic world; nothing above it does (ADR-0007).
 */

export * from "./world";
export * from "./repository";
export { buildProjectPulse, buildAskSession } from "./pulse";
export { VIKTORIA_MEETING_ID, COUPLE_MEETING_ID } from "./agent";

export * from "./showroom/sessions";
export * from "./showroom/project";
