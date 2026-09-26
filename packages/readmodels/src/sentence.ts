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
 *   {#name|count}   the figure `name` as a numeral. While the number `count`
 *                   is a whole 1 to 4, it is this sentence's own word for it,
 *                   from `numerals[name]`, one entry per number; otherwise —
 *                   5 and above, and 0 or a fraction — it is the figure `name`
 *                   exactly as the site passed it, which the project's locale
 *                   has already formatted, grouping and all. An entry may be a
 *                   whole phrase: in Slovak the preposition before a numeral
 *                   can change with the numeral, "z" before one and "zo"
 *                   before another, so the preposition belongs in the entry.
 *   {az:name}       Hungarian: the value after the definite article its first
 *                   sound takes, "a" or "az"; {Az:name} at a sentence's start
 *   {az:#name|count} the same article, before a numeral
 *
 * A counted word may carry `{name}` and `{#name|count}` placeholders of its
 * own — "one meeting" beside "{count} meetings" — and they are filled once the
 * word is chosen.
 *
 * A numeral takes two values under two names: `name` is the figure as the
 * locale formatted it, `count` the number it was formatted from. One key
 * cannot be both, so `{#views|views}` is refused, and says so.
 *
 * THE ARTICLE BEFORE A NUMERAL IS CHOSEN AFTER THE NUMERAL IS WRITTEN. The
 * passes run in this order: counted words, numerals, values. An article
 * follows the first sound of what the reader reads, and from 1 to 4 the reader
 * reads the sentence's word, not the figure — a word, or a whole phrase, whose
 * first sound the figure does not decide. The value pass reads `values[name]`,
 * which for a numeral is the figure, so an article chosen there would be the
 * figure's. The numeral pass therefore writes the numeral first and gives
 * `hungarianArticle` exactly the text it will print: a word, read by its first
 * letter, or a figure, read by the rule for numbers — "az 5", "a 12".
 *
 * Nothing here formats a figure. A value arrives formatted by the site, in the
 * project's locale, so the language chooses the words and the locale the
 * numbers, and neither is read from the other. A numeral's figure must arrive
 * as that formatted text: a number there is refused rather than written as
 * `String(n)`, which drops the grouping — "12345" where the locale writes
 * "12,345".
 */
export interface SentenceIn<L extends Language> {
  readonly text: string;
  readonly words?: Readonly<Record<string, PluralForms[L]>>;
  /** This sentence's own words for 1, 2, 3 and 4, per numeral: see `{#name|count}`. */
  readonly numerals?: Readonly<Record<string, Numerals>>;
}

/** A numeral's words for 1, 2, 3 and 4, in that order. */
export type Numerals = readonly [one: string, two: string, three: string, four: string];

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
  const numbered = counted.replace(
    /\{(?:(az|Az):)?#(\w+)\|(\w+)\}/g,
    (_match, article: string | undefined, name: string, by: string) => {
      const written = numeral(language, own, name, by, values);
      return article === undefined
        ? written
        : `${hungarianArticle(written, article === "Az")} ${written}`;
    },
  );
  return numbered.replace(
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

/** `{#name|count}`: the sentence's word while `n` is a whole 1 to 4, the formatted figure otherwise. */
function numeral(
  language: Language,
  own: SentenceIn<Language>,
  name: string,
  by: string,
  values: SentenceValues,
): string {
  if (name === by) {
    throw new Error(
      `The ${language} sentence writes {#${name}|${by}}: a numeral needs two values under two names, the formatted figure and the count.`,
    );
  }
  const figure = values[name];
  const n = values[by];
  const words = own.numerals?.[name];
  if (words === undefined) {
    throw new Error(
      `The ${language} sentence writes "${name}" as a numeral and has no words for it.`,
    );
  }
  if (typeof n !== "number") {
    throw new Error(`The ${language} sentence writes "${name}" by a count that is not a number.`);
  }
  if (typeof figure !== "string") {
    throw new Error(
      `The ${language} sentence writes "${name}" as a numeral: its figure must arrive formatted, as text.`,
    );
  }
  const word = Number.isInteger(n) && n >= 1 && n <= 4 ? words[n - 1] : undefined;
  return word ?? figure;
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
