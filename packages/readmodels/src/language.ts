/**
 * THE LANGUAGE OF THE WORDS, AND NOTHING ELSE.
 *
 * Three languages: Slovak, English and Hungarian. The language chooses the
 * words a view is written in; the locale (`ProjectSummary.locale`) formats its
 * numbers, money and dates. They are two facts, and neither is derived from the
 * other: a Hungarian reader of a Slovak project reads Hungarian words and the
 * figures as that project formats them.
 *
 * It lives here, beside the read models, rather than in the synthetic generator,
 * because the repository that replaces the generator takes the same request and
 * has to choose the same words.
 */
export const LANGUAGES = ["sk", "en", "hu"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Every caller passes this until the reader can choose. */
export const DEFAULT_LANGUAGE: Language = "en";

/**
 * A word or a phrase as each language writes it after a count, beside the
 * sentence that uses it.
 *
 * Each language carries the categories its own plural rules give a count:
 * English two, Slovak three — and a fourth where the count can be a fraction —
 * and Hungarian two, which are the same singular form, for the reason on
 * `plural`, and a third where the words change from 2 to 4, for the reason on
 * `pluralCategory`.
 */
export interface PluralForms {
  readonly en: { readonly one: string; readonly other: string };
  /** 1 · 2 to 4 · 0 and 5 and above · and a fraction, "1,5", where the count can be one. */
  readonly sk: {
    readonly one: string;
    readonly few: string;
    readonly other: string;
    readonly many?: string;
  };
  /** 1 · 2 to 4, where an entry needs it · everything else. All singular, `few` too. See `plural`. */
  readonly hu: { readonly one: string; readonly few?: string; readonly other: string };
}

const RULES: Readonly<Record<Language, Intl.PluralRules>> = {
  sk: new Intl.PluralRules("sk"),
  en: new Intl.PluralRules("en"),
  hu: new Intl.PluralRules("hu"),
};

/**
 * THE FORM A COUNT TAKES, CHOSEN BY THE LANGUAGE'S OWN RULES.
 *
 * `n === 1 ? "day" : "days"` is English, and English alone.
 *
 * Slovak has three forms for a count: one for 1, one for 2 to 4, and one for 0
 * and 5 and above (`one`, `few`, `other`) — "1 deň", "3 dni", "5 dní". The
 * pattern `n === 1 ? a : b` is wrong from 2 to 4, not only above 5.
 *
 * In Hungarian, after a numeral the noun stays SINGULAR: 5 találkozó, not 5
 * találkozók. Intl.PluralRules gives Hungarian a `one` and an `other` slot,
 * and the Hungarian `other` slot takes the SINGULAR form. So does the `few`
 * slot this product adds for 2 to 4 (see `pluralCategory`): all three
 * Hungarian slots take the SINGULAR form. If anyone writes the plural in any
 * of them, every count that slot answers is wrong, and the type check will
 * not notice.
 *
 * The form is chosen for the figure as printed, so a caller that prints a
 * rounded value passes the rounded value. A fraction takes Slovak's fourth
 * form, `many` — "1,5 izby", the genitive singular — and an entry for
 * something that can be counted in halves, a room or a day, carries it. A count
 * of meetings is never a fraction, and its entry carries three.
 */
export function plural(language: Language, n: number, forms: PluralForms): string {
  const set: Readonly<Record<string, string>> = forms[language];
  return set[pluralCategory(language, n)] ?? forms[language].other;
}

/**
 * The category a language's own rules put a count in: "one", "few", "many" or "other".
 *
 * HUNGARIAN DEPARTS FROM CLDR HERE, ON PURPOSE. CLDR gives Hungarian `one` and
 * `other` only, and as grammatical number that is right: the noun is singular
 * after every numeral. The distinction this product needs is not grammatical
 * number but word choice — a count from 1 to 4 is written as a word, and "mind
 * a …" reads naturally from 2 to 4 and not above — so a whole 2, 3 or 4 is
 * `few` in Hungarian as it is in Slovak. Everything else is what
 * `Intl.PluralRules` says.
 *
 * Nothing written before this breaks: an entry with no `few` slot answers 2 to
 * 4 with its `other` form, through the `?? other` in `plural` and `sentence`.
 */
export function pluralCategory(language: Language, n: number): Intl.LDMLPluralRule {
  if (language === "hu" && Number.isInteger(n) && n >= 2 && n <= 4) return "few";
  return RULES[language].select(n);
}

/**
 * THE SLOVAK "Z" OR "ZO" BEFORE A NUMBER.
 *
 * Slovak writes "zo" for "z" before a word that begins with s, z, š or ž: "zo
 * štyroch", but "z troch". Before a number the word that decides is the one
 * said first, the genitive of the number's largest part. So 24 takes "z",
 * said "dvadsiatich štyroch", although 4 alone takes "zo".
 *
 * This is not a Slovak number-writer and must not become one. It holds only
 * the words that can lead a number, in the genitive, to read their first
 * sound. The thousand stands for every larger power as well — tisíc, milión
 * and miliarda all take "z" — so a count of thousands is led by whatever
 * leads that count: 4 000 by "štyroch", 24 000 by "dvadsiatich".
 */
const SLOVAK_LEADING_GENITIVE: Readonly<Record<number, string>> = {
  0: "nuly",
  1: "jedného",
  2: "dvoch",
  3: "troch",
  4: "štyroch",
  5: "piatich",
  6: "šiestich",
  7: "siedmich",
  8: "ôsmich",
  9: "deviatich",
  10: "desiatich",
  11: "jedenástich",
  12: "dvanástich",
  13: "trinástich",
  14: "štrnástich",
  15: "pätnástich",
  16: "šestnástich",
  17: "sedemnástich",
  18: "osemnástich",
  19: "devätnástich",
  20: "dvadsiatich",
  30: "tridsiatich",
  40: "štyridsiatich",
  50: "päťdesiatich",
  60: "šesťdesiatich",
  70: "sedemdesiatich",
  80: "osemdesiatich",
  90: "deväťdesiatich",
  100: "sto",
  200: "dvesto",
  300: "tristo",
  400: "štyristo",
  500: "päťsto",
  600: "šesťsto",
  700: "sedemsto",
  800: "osemsto",
  900: "deväťsto",
  1000: "tisíc",
};

/** The part of a whole number said first: 24 → 20, 124 → 100, 4 000 → 4, 1 500 → 1 000. */
function leadingPart(n: number): number {
  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    return thousands === 1 ? 1000 : leadingPart(thousands);
  }
  if (n >= 100) return Math.floor(n / 100) * 100;
  if (n >= 20) return Math.floor(n / 10) * 10;
  return n;
}

/** "z" or "zo", the form of the Slovak preposition before the number `n`. */
export function slovakZForm(n: number): "z" | "zo" {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`The Slovak "z" or "zo" is read before a whole number, not before ${n}.`);
  }
  const word = SLOVAK_LEADING_GENITIVE[leadingPart(n)] ?? "";
  return /^[szšž]/.test(word) ? "zo" : "z";
}
