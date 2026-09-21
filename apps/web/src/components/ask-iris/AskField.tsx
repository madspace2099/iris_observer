"use client";

import { useRef } from "react";

/**
 * The prompt field, and the only client component on this screen.
 *
 * ## Why the rest of Ask IRIS ships no JavaScript, and this does
 *
 * Everything else here is a link or a form. Opening the history panel is a
 * navigation, choosing a model is a `<details>`, sending a question is a `GET`
 * submit — so the whole screen renders, answers and is fully operable with
 * scripting switched off, and every state it can be in has an address somebody
 * can send to a colleague. That is worth far more on an analytical surface than
 * a client-side conversation, and it is what the surrounding product already
 * does with the period and the project.
 *
 * One thing genuinely cannot be done that way. A `<textarea>` does not submit
 * its form on Enter — only a single-line `<input>` does — and the design's
 * field is 88px of wrapping text at 24px, so it has to be a textarea. A reader
 * typing a question and pressing Enter must not be met with a blank line, so
 * this hands the keystroke to the form.
 *
 * Shift+Enter still writes a newline, which is the convention every prompt
 * field in the world now shares, and the placeholder is not the place to teach
 * it: the note beneath the composer says it in words.
 *
 * ## What it deliberately does not do
 *
 * It does not hold the question in state, autosize, autosave a draft or
 * remember anything. Browser storage of every kind is banned in this
 * application and asserted by a test; the question's home is the URL after it
 * is asked, and before that it is the field's own value like any other form.
 */
export function AskField({
  name,
  defaultValue,
  label,
  placeholder,
}: {
  readonly name: string;
  readonly defaultValue: string;
  readonly label: string;
  readonly placeholder: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <label className="ask-sr" htmlFor="ask-prompt">
        {label}
      </label>
      <textarea
        id="ask-prompt"
        ref={field}
        className="ask-field"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        spellCheck={false}
        rows={3}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          /*
           * A composing keystroke is not a send. An input method editor uses
           * Enter to accept a candidate, so submitting here would swallow the
           * first word of every question typed in Japanese, Korean or Chinese.
           */
          if (event.nativeEvent.isComposing) return;

          const form = field.current?.form;
          if (form === null || form === undefined) return;

          event.preventDefault();
          /*
           * `requestSubmit`, not `submit`. The plain one bypasses validation
           * and, more importantly here, does not fire the submit event, so the
           * framework never sees the navigation.
           */
          form.requestSubmit();
        }}
      />
    </>
  );
}
