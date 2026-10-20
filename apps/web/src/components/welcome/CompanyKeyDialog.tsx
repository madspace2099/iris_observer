"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MODEL_WORDED } from "@/components/ask-iris/live-questions";
import { Dialog } from "@/components/product/Dialog";
import { dynamicRoute } from "@/lib/href";

/**
 * THE COMPANY'S OPENAI KEY, ASKED FOR ONCE AFTER SIGN-IN (ADR-0043).
 *
 * Shown over the welcome to a company's admin while the company has no key, on
 * a local demonstration only; the page decides that, this draws it. The
 * product's one floating panel (`Dialog`), on the graphite ground.
 *
 * The key never enters React: the field is uncontrolled and its value exists
 * in the DOM until the form posts it to the server action, which is the only
 * place it is read. Nothing here imports the credential modules, and nothing
 * here calls a model.
 *
 * Skip is a real link to the destination the server validated, and Escape does
 * the same, so a reader can always go on without a key. The welcome behind
 * holds still meanwhile (`WelcomeSequence`'s `hold`): Enter in this field
 * submits this form and nothing else.
 *
 * While the key is checked (one request to OpenAI, up to a few seconds) Save
 * says so and is disabled, so a second press sends no second probe. The
 * pending flag is React's; the key is not.
 */
export function CompanyKeyDialog({
  to,
  company,
  failure,
  action,
}: {
  /** Already validated on the server: where Skip, Escape and a saved key go. */
  readonly to: string;
  readonly company: string;
  /** The title of the last attempt's failure, from `describeFailure`, or null. */
  readonly failure: string | null;
  readonly action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const ids = useId();
  const titleId = `${ids}-title`;
  const noteId = `${ids}-note`;
  const formId = `${ids}-form`;
  const fieldId = `${ids}-key`;
  const [, submit, checking] = useActionState(async (_: null, form: FormData) => {
    await action(form);
    return null;
  }, null);

  return (
    <Dialog
      open
      onDismiss={() => router.replace(dynamicRoute(to))}
      labelledBy={titleId}
      describedBy={noteId}
    >
      <div className="ox-dialog-head">
        <h2 className="ox-dialog-title" id={titleId}>
          Connect Ask IRIS to OpenAI
        </h2>
      </div>

      <div className="ox-dialog-body">
        <p className="ox-section-note" id={noteId}>
          The key is kept in this server&rsquo;s memory for {company} until the server restarts.
          Every member of {company} asks with it, and it is never shown again. With it,{" "}
          {MODEL_WORDED} in Ask IRIS are worded by a language model from the figures
          Observer&rsquo;s read models compute; every figure it writes in digits is checked against
          them before it is shown.
        </p>

        {failure === null ? null : (
          <div className="os-flash" data-tone="bad" role="alert">
            <strong>{failure}</strong>
            <span>Nothing was saved. Paste the key again, or skip for now.</span>
          </div>
        )}

        <form id={formId} action={submit}>
          <input type="hidden" name="to" value={to} />
          <label className="ox-field" htmlFor={fieldId}>
            <span className="ox-field-label">OpenAI API key for {company}</span>
            <input
              className="ox-input"
              id={fieldId}
              name="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              required
              data-autofocus=""
              placeholder="sk-…"
            />
          </label>
        </form>
      </div>

      <div className="ox-dialog-foot">
        <p className="ox-dialog-note">Saving sends one small request to OpenAI to check the key.</p>
        <Link className="ox-btn" data-weight="quiet" href={dynamicRoute(to)} replace>
          Skip for now
        </Link>
        <button
          type="submit"
          form={formId}
          className="ox-btn"
          data-weight="primary"
          disabled={checking}
          aria-busy={checking}
        >
          {checking ? "Checking the key…" : "Save key"}
        </button>
      </div>
    </Dialog>
  );
}
