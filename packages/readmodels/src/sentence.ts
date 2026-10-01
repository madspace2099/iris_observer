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
 *                   from `numerals[name]`, one entry per number; at 5 it is
 *                   the table's fifth word where the table has one; otherwise
 *                   — 6 and above, and 0 or a fraction — it is the figure
 *                   `name` exactly as the site passed it, which the project's
 *                   locale has already formatted, grouping and all. An entry may be a
 *                   whole phrase: in Slovak the preposition before a numeral
 *                   can change with the numeral, "z" before one and "zo"
 *                   before another, so the preposition belongs in the entry.
 *   {az:name}       Hungarian: the value after the definite article its first
 *                   sound takes, "a" or "az"; {Az:name} at a sentence's start
 *   {az:#name|count} the same article, before a numeral
 *   {az:name-s}     Hungarian: the value with its article before it and its
 *                   "-s" suffix after it, both read from the same value — "az
 *                   A-103-as lakást", "a B-302-es lakást". The suffix follows
 *                   the number at the value's end (`hungarianNumberSuffix`).
 *                   {Az:name-s} at a sentence's start; {name-s} without the
 *                   article.
 *   {name-val}      Hungarian: the value with the "-val/-vel" suffix its
 *                   number is said with — "1-gyel", "16-tal"
 *                   (`hungarianInstrumental`).
 *   {name-t}        Hungarian: the value with the accusative suffix — "74-et",
 *                   "39-et" (`hungarianAccusative`).
 *
 * A counted word may carry `{name}`, `{#name|count}` and `{word|count}`
 * placeholders of its own — "one meeting" beside "{count} meetings" — and they
 * are filled once the word is chosen. A counted word inside a counted word is
 * how a sentence whose whole wording turns on one count still counts another.
 *
 * A numeral takes two values under two names: `name` is the figure as the
 * locale formatted it, `count` the number it was formatted from. One key
 * cannot be both, so `{#views|views}` is refused, and says so.
 *
 * THE ARTICLE BEFORE A NUMERAL IS CHOSEN AFTER THE NUMERAL IS WRITTEN. The
 * passes run in this order: counted words, numerals, values. An article
 * follows the first sound of what the reader reads, and while the table has a
 * word for the count the reader reads that word, not the figure — a word, or a whole phrase, whose
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
/**
 * A numeral's words for 1, 2, 3 and 4, and for 5 where the sentence has one.
 *
 * The fifth cell may be left out, and leaving it out is not a mistake: it is
 * the behaviour every table had before there was a fifth cell — from 5 the
 * figure. Where the product writes digits is a grammatical boundary, not a
 * numeric one, and the sentence decides it: in an inflected position Slovak
 * writes five as a word too (piatich), so the Slovak tables take their fifth
 * cell in the round that writes their text. A test will require that cell,
 * not this type: the requirement belongs where the linguistic data lives.
 */
export type Numerals = readonly [
  one: string,
  two: string,
  three: string,
  four: string,
  five?: string,
];

export interface Sentence {
  readonly en: SentenceIn<"en">;
  readonly sk: SentenceIn<"sk">;
  readonly hu: SentenceIn<"hu">;
}

export type SentenceValues = Readonly<Record<string, string | number>>;

export function sentence(language: Language, entry: Sentence, values: SentenceValues): string {
  const own: SentenceIn<Language> = entry[language];
  const counted = countedWords(language, own, own.text, values, 0);
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
    /\{(?:(az|Az):)?(\w+)(-s|-val|-t)?\}/g,
    (_match, article: string | undefined, name: string, suffix: string | undefined) => {
      const value = values[name];
      if (value === undefined) {
        throw new Error(`The ${language} sentence has no value for {${name}}.`);
      }
      const text = String(value);
      const written =
        suffix === "-s"
          ? `${text}${hungarianNumberSuffix(text)}`
          : suffix === "-val"
            ? hungarianInstrumental(text)
            : suffix === "-t"
              ? hungarianAccusative(text)
              : text;
      return article === undefined
        ? written
        : `${hungarianArticle(text, article === "Az")} ${written}`;
    },
  );
}

/** `{word|count}`, and the counted words the chosen form carries in turn, three deep at most. */
function countedWords(
  language: Language,
  own: SentenceIn<Language>,
  text: string,
  values: SentenceValues,
  depth: number,
): string {
  return text.replace(/\{(\w+)\|(\w+)\}/g, (_match, word: string, by: string) => {
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
    if (depth === 3) {
      throw new Error(`The ${language} sentence nests counted words more than three deep.`);
    }
    const form = forms[pluralCategory(language, n)] ?? forms["other"] ?? "";
    return countedWords(language, own, form, values, depth + 1);
  });
}

/** `{#name|count}`: the sentence's word for a whole 1 to 4, and 5 if it has one; the formatted figure otherwise. */
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
  const word = Number.isInteger(n) && n >= 1 && n <= 5 ? words[n - 1] : undefined;
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

/**
 * THE HUNGARIAN "-s" SUFFIX AFTER A NUMBER, AS IT IS SAID.
 *
 * A code takes the suffix its last number is said with: "A-103-as" (három),
 * "A-105-ös" (öt), "B-302-es" (kettő). The last digit decides; where it is a
 * nought, the digit before it does, a second nought makes it a hundred, and
 * a nought standing alone is "-ás" (nulla).
 *
 * A number ending in "…000" would take "-es" (ezer), and this table would read
 * it as a hundred. A unit code cannot end so: the two digits after the floor
 * start at 01, so no code ends even in "00".
 *
 * This table is the one place the suffixes are written, and it is still being
 * checked: correct it here and nowhere else.
 */
const HUNGARIAN_NUMBER_SUFFIX: Readonly<Record<string, string>> = {
  "0": "-ás",
  "1": "-es",
  "2": "-es",
  "3": "-as",
  "4": "-es",
  "5": "-ös",
  "6": "-os",
  "7": "-es",
  "8": "-as",
  "9": "-es",
  "10": "-es",
  "20": "-as",
  "30": "-as",
  "40": "-es",
  "50": "-es",
  "60": "-as",
  "70": "-es",
  "80": "-as",
  "90": "-es",
  "100": "-as",
};

/**
 * "1-nél", "3-nál": a number with the Hungarian "-nál/-nél" after it.
 *
 * The vowel is the one the "-s" suffix above already takes for that number
 * ("-es", "-ös" front; "-as", "-os", "-ás" back), so no second table is kept:
 * a number whose "-s" suffix is corrected here is corrected there too.
 */
export function hungarianAdessive(value: string): string {
  return `${value}${/[aáo]/.test(hungarianNumberSuffix(value)) ? "-nál" : "-nél"}`;
}

/**
 * The row of a number-suffix table the number at the end of `value` is read
 * by: its last digit; where that is a nought, the digit before it as a ten; a
 * second nought, a hundred; a nought alone, nought. One reading for every
 * table below, so a number is said the same way whichever suffix it takes.
 */
function hungarianNumberKey(value: string, table: Readonly<Record<string, string>>): string {
  const digits = /\d+$/.exec(value)?.[0] ?? "";
  const last = digits.at(-1);
  const tens = digits.at(-2);
  const key = last !== "0" ? last : tens === undefined ? "0" : tens !== "0" ? `${tens}0` : "100";
  const suffix = key === undefined ? undefined : table[key];
  if (suffix === undefined) {
    throw new Error(
      `"${value}" does not end in a number, so no Hungarian suffix can be read from it.`,
    );
  }
  return suffix;
}

/** "-as" for "A-103": the suffix the number at the end of `value` takes. */
export function hungarianNumberSuffix(value: string): string {
  return hungarianNumberKey(value, HUNGARIAN_NUMBER_SUFFIX);
}

/**
 * THE HUNGARIAN "-VAL/-VEL" AND ACCUSATIVE SUFFIXES AFTER A NUMBER (BEKOTES1).
 *
 * As Máté approved them on the P2-17 question sheet, 2026-10-01 (questions 1
 * and 2): the suffix the number is said with, written after a hyphen, read by
 * the same row as the "-s" suffix above. Like that table, a number ending in
 * "…000" is read as a hundred ("ezer" would take "-rel", "-et"): the counts
 * these follow are meetings and their shortfall, which do not reach a thousand
 * on any page today. Correct a row here and nowhere else.
 */
const HUNGARIAN_INSTRUMENTAL: Readonly<Record<string, string>> = {
  "0": "-val",
  "1": "-gyel",
  "2": "-vel",
  "3": "-mal",
  "4": "-gyel",
  "5": "-tel",
  "6": "-tal",
  "7": "-tel",
  "8": "-cal",
  "9": "-cel",
  "10": "-zel",
  "20": "-szal",
  "30": "-cal",
  "40": "-nel",
  "50": "-nel",
  "60": "-nal",
  "70": "-nel",
  "80": "-nal",
  "90": "-nel",
  "100": "-zal",
};

const HUNGARIAN_ACCUSATIVE: Readonly<Record<string, string>> = {
  "0": "-t",
  "1": "-et",
  "2": "-t",
  "3": "-at",
  "4": "-et",
  "5": "-öt",
  "6": "-ot",
  "7": "-et",
  "8": "-at",
  "9": "-et",
  "10": "-et",
  "20": "-at",
  "30": "-at",
  "40": "-et",
  "50": "-et",
  "60": "-at",
  "70": "-et",
  "80": "-at",
  "90": "-et",
  "100": "-at",
};

/** "1-gyel", "16-tal": a number with the Hungarian "-val/-vel" after it. */
export function hungarianInstrumental(value: string): string {
  return `${value}${hungarianNumberKey(value, HUNGARIAN_INSTRUMENTAL)}`;
}

/** "74-et", "39-et": a number with the Hungarian accusative after it. */
export function hungarianAccusative(value: string): string {
  return `${value}${hungarianNumberKey(value, HUNGARIAN_ACCUSATIVE)}`;
}
