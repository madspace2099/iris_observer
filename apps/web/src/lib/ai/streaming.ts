/**
 * Reading prose out of JSON that has not finished arriving.
 *
 * Observer's answers are structured (`ObserverAnswer`), because a schema can be
 * validated and a paragraph cannot. Structured output arrives as one JSON
 * document, and a reader watching a spinner until the closing brace lands is
 * the experience the whole streaming requirement exists to avoid.
 *
 * So this scans the token stream as it arrives and emits the characters of
 * named top-level string fields the moment they are produced. Nothing else is
 * interpreted: the complete document is still parsed and validated at the end,
 * and **what is streamed here is never what is trusted**. If validation fails,
 * the streamed text is discarded and the reader is told, rather than being left
 * with a half-sentence that looked like an answer.
 *
 * Deliberately dependency-free and pure so it is testable character by
 * character, including the awkward cases: a `\u` escape split across two
 * chunks, a quote inside a value, a watched key nested inside an unwatched
 * object.
 */

export interface FieldDelta {
  readonly field: string;
  readonly delta: string;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

export class JsonFieldStreamer {
  private readonly watched: ReadonlySet<string>;

  /** Nesting depth. Watched fields are top-level, so only depth 1 counts. */
  private depth = 0;
  private inString = false;
  private escaping = false;
  /** Collected hex digits of a `\uXXXX` sequence, which may span chunks. */
  private unicode: string | null = null;
  /** True when the string currently being read sits where a key belongs. */
  private readingKey = false;
  private expectingKey = false;
  private keyBuffer = "";
  private currentKey: string | null = null;
  /** The watched field whose value is currently streaming, if any. */
  private emitting: string | null = null;

  constructor(fields: readonly string[]) {
    this.watched = new Set(fields);
  }

  /**
   * Feeds a chunk in and returns whatever became readable because of it.
   *
   * Deltas are coalesced per field so a consumer receives one event per field
   * per chunk rather than one per character.
   */
  push(chunk: string): readonly FieldDelta[] {
    const produced = new Map<string, string>();

    const emit = (text: string): void => {
      if (this.emitting === null || text.length === 0) return;
      produced.set(this.emitting, (produced.get(this.emitting) ?? "") + text);
    };

    for (const char of chunk) {
      if (this.inString) {
        if (this.unicode !== null) {
          this.unicode += char;
          if (this.unicode.length === 4) {
            const code = Number.parseInt(this.unicode, 16);
            const decoded = Number.isNaN(code) ? "" : String.fromCharCode(code);
            if (this.readingKey) this.keyBuffer += decoded;
            else emit(decoded);
            this.unicode = null;
          }
          continue;
        }

        if (this.escaping) {
          this.escaping = false;
          if (char === "u") {
            this.unicode = "";
            continue;
          }
          const decoded = SIMPLE_ESCAPES[char] ?? char;
          if (this.readingKey) this.keyBuffer += decoded;
          else emit(decoded);
          continue;
        }

        if (char === "\\") {
          this.escaping = true;
          continue;
        }

        if (char === '"') {
          this.inString = false;
          if (this.readingKey) {
            this.currentKey = this.keyBuffer;
            this.keyBuffer = "";
            this.readingKey = false;
          } else {
            // The value ended. Stop streaming whatever it was.
            this.emitting = null;
          }
          continue;
        }

        if (this.readingKey) this.keyBuffer += char;
        else emit(char);
        continue;
      }

      switch (char) {
        case '"':
          this.inString = true;
          this.readingKey = this.expectingKey;
          if (this.readingKey) {
            this.keyBuffer = "";
          } else if (
            this.depth === 1 &&
            this.currentKey !== null &&
            this.watched.has(this.currentKey)
          ) {
            this.emitting = this.currentKey;
          }
          break;
        case "{":
          this.depth += 1;
          this.expectingKey = this.depth === 1;
          this.currentKey = null;
          break;
        case "[":
          this.depth += 1;
          this.expectingKey = false;
          break;
        case "}":
        case "]":
          this.depth -= 1;
          this.expectingKey = false;
          this.currentKey = null;
          break;
        case ":":
          this.expectingKey = false;
          break;
        case ",":
          // Only a top-level comma returns us to a key position. A comma inside
          // an array of objects must not make the next string look like a
          // top-level key.
          this.expectingKey = this.depth === 1;
          this.currentKey = null;
          break;
        default:
          break;
      }
    }

    return [...produced].map(([field, delta]) => ({ field, delta }));
  }
}

/**
 * The fields a reader watches arrive.
 *
 * `answer` first because it is the sentence somebody came for, `interpretation`
 * second because it is the longest and benefits most from arriving early. The
 * remaining fields are structure rather than prose and are shown once the
 * document has been validated.
 */
export const STREAMED_FIELDS = ["answer", "interpretation"] as const;
