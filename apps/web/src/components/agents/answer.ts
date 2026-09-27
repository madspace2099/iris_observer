import {
  DEFAULT_LANGUAGE,
  hungarianArticle,
  slovakZForm,
  type AgentDetailView,
  type Language,
} from "@observer/readmodels";

/* The habit's sentence in the other languages a report can be printed in; drafts for review (P2-17). */
const HABIT: Readonly<
  Record<
    Exclude<Language, "en">,
    (name: string, index: string, section: string, timed: number, held: number) => string
  >
> = {
  sk: (name, index, section, timed, held) =>
    `${name} venuje sekcii ${section} ${index}× väčší podiel času prezentácie ako tím (${String(timed)} ${slovakZForm(held)} ${String(held)} stretnutí, ktoré zdroj dokázal zmerať od začiatku do konca).`,
  hu: (name, index, section, timed, held) =>
    `${name} a csapatnál ${index}× nagyobb arányban tölti a bemutatási idejét ${hungarianArticle(section)} ${section} szakaszban (${String(held)} találkozóból ${String(timed)}, amelyet a forrás elejétől végéig mérni tudott).`,
};

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
export function agentAnswer(
  view: AgentDetailView,
  language: Language = DEFAULT_LANGUAGE,
): string | null {
  return (
    view.suppressionNote ??
    /* The habit's own floor, on the timed set: the read model's reason, not the habit. */
    view.profile.signatureNote ??
    (view.profile.signature === null
      ? null
      : language === "en"
        ? `${view.name} spends ${view.profile.signature.overIndex.toFixed(1)}× the team's share of presentation time in ${view.profile.signature.label}, across the ${view.profile.timedMeetings} of ${view.sampleSize} meetings the source could time end to end.`
        : HABIT[language](
            view.name,
            view.profile.signature.overIndex.toFixed(1),
            view.profile.signature.label,
            view.profile.timedMeetings,
            view.sampleSize,
          ))
  );
}
