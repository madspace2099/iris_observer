"use client";

import { useState } from "react";

/**
 * The prompt, and the questions worth asking.
 *
 * A client component because the field, the model control and the suggestions
 * are all one interaction: picking a suggestion fills the field rather than
 * navigating, which is the behaviour the design shows and the reason it is not
 * five links.
 *
 * ## What this does NOT do yet, and says so
 *
 * It does not send. `docs/PROJECT-STATE.md` records that no model-backed answer
 * has ever been produced here — the configured key is refused with
 * `401 invalid_api_key` — and ADR-0030 makes each account bring its own
 * connection, of which none exists. A prompt that looked ready to answer would
 * be the screen telling its first lie, and this surface's entire value is that
 * it does not.
 *
 * So the send control is disabled and one line explains why. When a connection
 * lands, that line goes and the handler arrives; nothing else on the page moves.
 */

/**
 * The five openings, from the design.
 *
 * They are the artefact's own text, and they are worth keeping as written: each
 * one is answerable from the read models this product already has, which is not
 * true of most questions somebody would type. They are examples of the shape of
 * question this surface is for.
 */
const SUGGESTIONS: readonly {
  readonly text: string;
  readonly icon: "trend" | "units" | "period" | "people" | "next";
}[] = [
  { text: "What were the main insights from this month?", icon: "trend" },
  { text: "Which apartments need attention right now?", icon: "units" },
  { text: "How does this project compare to the previous period?", icon: "period" },
  { text: "Which sales agents need support this week?", icon: "people" },
  { text: "What should we focus on next?", icon: "next" },
];

const ICON_PATHS: Readonly<Record<string, readonly string[]>> = {
  trend: ["M16 7h6v6", "m22 7-8.5 8.5-5-5L2 17"],
  units: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 21v-6h6v6"],
  period: ["M3 12a9 9 0 1 0 9-9", "M3 4v5h5", "M12 7v5l3 2"],
  people: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
    "M22 21v-2a4 4 0 0 0-3-3.87",
  ],
  next: [
    "M12 2v4",
    "M12 18v4",
    "M4.9 4.9l2.9 2.9",
    "M16.2 16.2l2.9 2.9",
    "M2 12h4",
    "M18 12h4",
    "M4.9 19.1l2.9-2.9",
    "M16.2 7.8l2.9-2.9",
  ],
};

function Glyph({ icon }: { readonly icon: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(ICON_PATHS[icon] ?? []).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function AskIris({ projectName }: { readonly projectName: string }) {
  const [question, setQuestion] = useState("");

  return (
    <div className="irs-ask">
      <div className="irs-ask-card">
        <label className="obs-sr" htmlFor="iris-prompt">
          Ask IRIS about {projectName}
        </label>
        <textarea
          id="iris-prompt"
          className="irs-ask-field"
          placeholder="Ask IRIS…"
          spellCheck={false}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />

        <div className="irs-ask-foot">
          <button type="button" className="irs-ask-model" aria-haspopup="listbox" disabled>
            <span>No connection</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flex: "none", opacity: 0.82 }}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <button
            type="button"
            className="irs-ask-send"
            disabled
            aria-label="Send — unavailable until a model connection exists"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      </div>

      <p className="irs-ask-notice">
        <strong>Not connected.</strong>
        <span>
          No account on this deployment holds a model connection, so IRIS cannot answer yet. The
          questions below are the ones this project&rsquo;s read models can already support — they
          fill the field rather than being sent.
        </span>
      </p>

      <ul className="irs-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion.text}>
            <button
              type="button"
              className="irs-suggestion"
              onClick={() => setQuestion(suggestion.text)}
            >
              <span className="irs-suggestion-mark">
                <Glyph icon={suggestion.icon} />
              </span>
              <span>{suggestion.text}</span>
              <svg
                className="irs-suggestion-chevron"
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
