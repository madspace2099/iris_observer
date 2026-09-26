import { pluralCategory, type Language, type PluralForms } from "./language";

/**
 * ONE SENTENCE, AS EACH LANGUAGE SAYS IT.
 *
 * `PluralForms` gives a word its forms after a count, and a word is not a
 * sentence: a Slovak or Hungarian word set into an English sentence reads
 * "Opened 5 ráz", and "v 3 stretnutiach" cannot be had from a dictionary that
 * only knows "3 stretnutia". So the sentence is the unit. It is written once
 * per language, in that language's own word order, with a placeholder for
 * every value it carries:
 *
 *   {name}          the value given for `name`, as given
 *   {word|count}    this sentence's own word `word`, in the form the number
 *                   `count` takes by the language's plural rules. The forms are
 *                   the sentence's, in the case the sentence puts the word in:
 *                   one word in two cases is two words.
 *   {az:name}       Hungarian: the value after the definite article its first
 *                   sound takes, "a" or "az"; {Az:name} at a sentence's start
 *
 * A counted word may carry `{name}` placeholders of its own — "one meeting"
 * beside "{count} meetings" — and they are filled once the word is chosen.
 *
 * Nothing here formats a figure. A value arrives formatted by the site, in the
 * project's locale, so the language chooses the words and the locale the
 * numbers, and neither is read from the other.
 */
export interface SentenceIn<L extends Language> {
  readonly text: string;
  readonly words?: Readonly<Record<string, PluralForms[L]>>;
}

export interface Sentence {
  readonly en: SentenceIn<"en">;
  readonly sk: SentenceIn<"sk">;
  readonly hu: SentenceIn<"hu">;
}

export type SentenceValues = Readonly<Record<string, string | number>>;

export function sentence(language: Language, entry: Sentence, values: SentenceValues): string {
  const own: SentenceIn<Language> = entry[language];
  const counted = own.text.replace(/\{(\w+)\|(\w+)\}/g, (_match, word: string, by: string) => {
    const forms: Readonly<Record<string, string | undefined>> | undefined = own.words?.[word];
    const n = values[by];
    if (forms === undefined) {
      throw new Error(`The ${language} sentence counts "${word}" and has no forms for it.`);
    }
    if (typeof n !== "number") {
      throw new Error(
        `The ${language} sentence counts "${word}" by "${by}", which is not a number.`,
      );
    }
    return forms[pluralCategory(language, n)] ?? forms["other"] ?? "";
  });
  return counted.replace(
    /\{(?:(az|Az):)?(\w+)\}/g,
    (_match, article: string | undefined, name: string) => {
      const value = values[name];
      if (value === undefined) {
        throw new Error(`The ${language} sentence has no value for {${name}}.`);
      }
      const text = String(value);
      return article === undefined ? text : `${hungarianArticle(text, article === "Az")} ${text}`;
    },
  );
}

/** Letters whose Hungarian names begin with a vowel sound, for a code read letter first: "az F-12". */
const VOWEL_NAMED_LETTERS = "AÁEÉFIÍLMNOÓÖŐRSUÚÜŰXY";

/**
 * "a" or "az", by the first sound of what follows: a vowel, a letter read by
 * its name ("az M-4"), or a number read aloud — "az 1" (egy), "az 5" (öt),
 * "az 1500" (ezerötszáz), "a 12" (tizenkettő).
 */
export function hungarianArticle(value: string, capital = false): string {
  const text = value.trimStart();
  const digits = /^\d+/.exec(text)?.[0];
  const vowel =
    digits !== undefined
      ? digits.startsWith("5") || (digits.startsWith("1") && digits.length % 3 === 1)
      : /^\p{L}(?!\p{L})/u.test(text)
        ? VOWEL_NAMED_LETTERS.includes((text[0] ?? "").toUpperCase())
        : /^[aáeéiíoóöőuúüű]/i.test(text);
  const article = vowel ? "az" : "a";
  return capital ? `A${article.slice(1)}` : article;
}
