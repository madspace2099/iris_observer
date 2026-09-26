import { DEFAULT_LANGUAGE, plural, type Language, type PluralForms } from "./language";

/**
 * A LENGTH OF TIME, IN MINUTES AND SECONDS, AS EACH LANGUAGE WRITES IT.
 *
 * English keeps the compact form it has always had: unit symbols against the
 * figure, the seconds padded to two places once there are minutes — "45s",
 * "1m 05s". Slovak and Hungarian write the words, and the minute and the
 * second are two counted words, each taking the form its own figure asks for:
 * "2 minúty 1 sekunda", "5 minút 5 sekúnd", "1 perc 45 másodperc".
 *
 * The seconds are always written, as English always writes them, "1m 00s":
 * a nought is Slovak's `other`, "0 sekúnd". The minutes are left out while
 * there are none, as English leaves them out: "45 sekúnd", never "0 minút 45
 * sekúnd". There are no hours; an hour is "60m 00s", and sixty minutes in the
 * other two languages.
 *
 * The figures are digits. The time is rounded to a whole second before it is
 * split, so a median of 119.5 seconds is "2m 00s" and never "1m 60s".
 *
 * A caller that passes no language gets English, as from every other word
 * helper here (`roomsWord`, `days`).
 */
const MINUTES: PluralForms = {
  en: { one: "m", other: "m" },
  sk: { one: "minúta", few: "minúty", other: "minút" },
  hu: { one: "perc", other: "perc" },
};

const SECONDS: PluralForms = {
  en: { one: "s", other: "s" },
  sk: { one: "sekunda", few: "sekundy", other: "sekúnd" },
  hu: { one: "másodperc", other: "másodperc" },
};

export function duration(seconds: number, language: Language = DEFAULT_LANGUAGE): string {
  const whole = Math.round(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  const minutes = plural(language, m, MINUTES);
  const secs = plural(language, s, SECONDS);
  if (language === "en") {
    return m === 0 ? `${s}${secs}` : `${m}${minutes} ${String(s).padStart(2, "0")}${secs}`;
  }
  return m === 0 ? `${s} ${secs}` : `${m} ${minutes} ${s} ${secs}`;
}
