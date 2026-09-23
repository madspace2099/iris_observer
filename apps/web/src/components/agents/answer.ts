import type { AgentDetailView } from "@observer/readmodels";

/**
 * THE TEN-SECOND ANSWER OF ONE AGENT'S SCREEN, AND THE TWO THINGS IT MAY BE.
 *
 * Below the floor it is the suppression sentence: how many meetings, how far
 * short, and what the page will therefore not say. Above it, the strongest
 * association the read model produced about how this person presents, on the
 * timed set it stands on. Where there is neither, there is no answer rather
 * than an invented one — a confident sentence with nothing behind it is the
 * failure the whole absence vocabulary exists to prevent.
 *
 * One function, because the sentence leads two surfaces — the agent's own
 * screen and their printed summary — and two copies of a sentence about a
 * named person is how the two come to say different things about them.
 */
export function agentAnswer(view: AgentDetailView): string | null {
  return (
    view.suppressionNote ??
    /* The habit's own floor, on the timed set: the read model's reason, not the habit. */
    view.profile.signatureNote ??
    (view.profile.signature === null
      ? null
      : `${view.name} spends ${view.profile.signature.overIndex.toFixed(1)}× the team's share of presentation time in ${view.profile.signature.label}, across the ${view.profile.timedMeetings} of ${view.sampleSize} meetings the source could time end to end.`)
  );
}
