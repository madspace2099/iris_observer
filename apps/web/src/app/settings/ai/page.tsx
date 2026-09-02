import Link from "next/link";
import type { Metadata } from "next";

import type { Viewer } from "@observer/readmodels";
import { dynamicRoute } from "@/lib/href";
import { repository } from "@/lib/repository";
import { requireAccount, requireViewer } from "@/lib/session";
import { connectionFor, type ConnectionMetadata } from "@/lib/credentials/service";
import { describeFailure, type ConnectionFailure } from "@/lib/credentials/failure";
import {
  CATALOGUE_VERSION,
  ESTIMATE_CAVEAT,
  MICROS_PER_DOLLAR,
  PRICE_SOURCE_URL,
  PRICES_VERIFIED,
  PRICES_VERIFIED_AT,
  pricesNeedRechecking,
  PROVIDERS,
  catalogue,
  formatMicros,
  modelEntry,
  type ModelId,
  type ProviderId,
} from "@/lib/models/catalogue";
import { preferencesFor } from "@/lib/models/preferences";
import { budgetFor, typicalQuestionMicros } from "@/lib/budget/service";
import { chooseBudget, chooseModels, connect, remove, test } from "./actions";
import "@/portal/portal.css";

export const metadata: Metadata = { title: "AI and usage" };

/**
 * ACCOUNT SETTINGS — AI AND USAGE.
 *
 * Three things, in the order a reader needs them: the keys that make Observer
 * able to answer at all, the model it answers with, and the ceiling on what
 * that may cost this month.
 *
 * Everything belongs to the authenticated ACCOUNT. Two people who share a
 * project have two sets of keys, two model choices and two budgets, and neither
 * can see, spend or change the other's.
 *
 * ## Nothing on this page is a secret
 *
 * `connectionFor` returns metadata — provider, last four characters, timestamps
 * — and cannot return a key because it never decrypts one. The forms are plain
 * and uncontrolled: a value exists in the DOM until it is submitted to a server
 * action and nowhere else. There is no Reveal, no Copy, and no endpoint that
 * could produce a stored key afterwards, because after saving nothing in this
 * system can.
 */
export default async function AiSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await requireAccount();
  const viewer = await requireViewer();
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const home = await firstProject(viewer);
  const preferences = await preferencesFor(account.accountId);

  /*
   * The ceiling is judged against the model this reader actually asks with.
   *
   * Their default costs what it costs; telling somebody on Sol that they have
   * room left because Luna would fit is arithmetic nobody can act on.
   */
  const budget = await budgetFor(
    account.accountId,
    typicalQuestionMicros(preferences.defaultModel),
  );

  /* One connection lookup per provider. Metadata only, never a key. */
  const connections = new Map<ProviderId, ConnectionMetadata | null>();
  let storageFailure: ConnectionFailure | null = null;
  for (const provider of PROVIDERS) {
    const state = await connectionFor(account.accountId, provider.id);
    if (state.kind === "unavailable") storageFailure = state.failure;
    connections.set(provider.id, state.kind === "connected" ? state.connection : null);
  }

  const done = first("done");
  const failed = first("failed") as ConnectionFailure | undefined;
  const focused = first("p");
  const confirming = first("confirm");
  const replacing = first("mode") === "replace" ? focused : undefined;
  const failure = failed === undefined ? null : describeFailure(failed);

  const unavailable = storageFailure !== null;

  return (
    <div className="mp">
      <a className="mp-skip" href="#main">
        Skip to content
      </a>

      <header className="mp-bar">
        <div className="mp-bar-inner">
          <span className="mp-bar-brand">MADSPACE</span>
          <span className="mp-bar-product">IRIS Observer</span>
          <div className="mp-bar-right">
            <Link className="mp-bar-link" href={dynamicRoute("/projects")}>
              Projects
            </Link>
            {home !== null && (
              <Link className="mp-bar-link" href={dynamicRoute(home.href)}>
                Observer
              </Link>
            )}
            <span className="mp-bar-who">
              <strong>{account.displayName}</strong>
              <span>{viewer.organisationName}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="mp-main mp-main-narrow" id="main" tabIndex={-1}>
        <div className="mp-head">
          <div>
            <p className="mp-head-eyebrow">Account settings</p>
            <h1>AI and usage</h1>
          </div>
        </div>

        <p className="mp-lede">
          Ask Observer runs on your own provider accounts. Everything here belongs to{" "}
          <strong>{account.email}</strong> and applies to every project you can open — never to
          anybody else&rsquo;s.
        </p>

        {done !== undefined && (
          <p className="mp-ok" role="status">
            {DONE[done] ?? "Saved."}
          </p>
        )}

        {failure !== null && (
          <div className="mp-alert" role="alert">
            <strong>{failure.title}</strong>
            <span>{failure.detail}</span>
          </div>
        )}

        <BudgetPanel budget={budget} unavailable={unavailable} />

        <ModelPanel preferences={preferences} connections={connections} unavailable={unavailable} />

        <ProviderPanel
          connections={connections}
          storageFailure={storageFailure}
          replacing={replacing}
          confirming={confirming}
        />
      </main>
    </div>
  );
}

const DONE: Readonly<Record<string, string>> = Object.freeze({
  connected: "Connected. Ask Observer can now use that provider.",
  connected_no_model:
    "Key saved. It works, but this account cannot reach the model it was tested against — choose another below.",
  replaced: "Key replaced. The previous one is gone.",
  tested: "Tested. The connection works.",
  removed: "Connection removed. The stored key has been deleted.",
  models: "Model choice saved.",
  budget: "Monthly budget saved.",
});

/**
 * The first project this account may open, or null.
 *
 * Asked of the repository so the "Observer" link is a grant rather than a
 * guess, and so an account with none simply does not get the link — an entry
 * leading to a refusal is worse than no entry.
 */
async function firstProject(viewer: Viewer): Promise<{ href: string } | null> {
  const tenants = await repository.listTenants(viewer);
  for (const tenant of tenants) {
    const projects = await repository.listProjects(viewer, tenant.id);
    const project = projects[0];
    if (project !== undefined) return { href: `/${tenant.slug}/${project.slug}/showroom` };
  }
  return null;
}

/* ==================================================================== budget */

function BudgetPanel({
  budget,
  unavailable,
}: {
  budget: Awaited<ReturnType<typeof budgetFor>>;
  unavailable: boolean;
}) {
  const dollars = budget === null ? 0 : budget.usage.budgetMicros / MICROS_PER_DOLLAR;

  return (
    <section className="mp-panel" aria-labelledby="budget">
      <h2 id="budget">Monthly Observer budget</h2>

      <p className="mp-panel-body">
        A ceiling on what Observer estimates your questions will cost this calendar month, in US
        dollars. It resets at the start of each month, UTC.
      </p>

      {budget !== null && budget.usage.budgetMicros > 0 && (
        <>
          <div className="mp-meter" data-threshold={budget.threshold}>
            <div
              className="mp-meter-fill"
              style={{ width: `${Math.min(100, budget.usedPercent)}%` }}
              aria-hidden="true"
            />
          </div>

          <dl className="mp-facts">
            <div>
              <dt>Used</dt>
              <dd>
                {formatMicros(budget.usage.spentMicros + budget.usage.reservedMicros)}{" "}
                <span className="mp-percent">({budget.usedPercent}%)</span>
              </dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{formatMicros(budget.remainingMicros)}</dd>
            </div>
            <div>
              <dt>Questions</dt>
              <dd>{budget.usage.requests}</dd>
            </div>
          </dl>

          {budget.threshold !== "ok" && (
            <p className="mp-threshold" data-threshold={budget.threshold} role="status">
              {THRESHOLD_TEXT[budget.threshold]}
            </p>
          )}
        </>
      )}

      <form action={chooseBudget} className="mp-fields">
        <label className="mp-label" htmlFor="budget-input">
          Monthly budget in USD
          <input
            className="mp-input"
            id="budget-input"
            name="budget"
            type="number"
            min="0"
            max="100000"
            /*
             * Cents, not whole dollars.
             *
             * `step="1"` made the browser silently refuse anything with a
             * decimal point: a reader typing 2.50 got a form that would not
             * submit and no explanation, and a single Observer question costs
             * well under a cent — so a whole-dollar-only ceiling cannot express
             * the amounts this feature actually deals in.
             */
            step="0.01"
            defaultValue={dollars}
            disabled={unavailable}
            inputMode="decimal"
          />
        </label>
        <button type="submit" className="mp-btn" disabled={unavailable}>
          Save budget
        </button>
      </form>

      <div className="mp-advice">
        <strong>What this figure is</strong>
        <p>{ESTIMATE_CAVEAT}</p>
        {PRICES_VERIFIED ? (
          <p>
            Catalogue {CATALOGUE_VERSION}, priced from OpenAI&rsquo;s published rates as read on{" "}
            {PRICES_VERIFIED_AT} at{" "}
            <a
              className="mp-link"
              href={PRICE_SOURCE_URL}
              rel="noreferrer noopener"
              target="_blank"
            >
              developers.openai.com
            </a>
            . A vendor can change a price the day after somebody checks it, so this is a dated
            reading rather than a standing guarantee.
            {pricesNeedRechecking() ? " These figures are due to be checked again." : ""}
          </p>
        ) : (
          <p>
            <strong>The price list has not been verified.</strong> Catalogue {CATALOGUE_VERSION}{" "}
            carries rates nobody has checked against the vendor. Treat every figure on this page as
            an order of magnitude, not a bill.
          </p>
        )}
      </div>
    </section>
  );
}

const THRESHOLD_TEXT: Readonly<Record<string, string>> = Object.freeze({
  half: "You have used half of this month's budget.",
  most: "You have used 80% or more of this month's budget.",
  exhausted:
    "This month's budget has no room for another question. Observer answers from measured evidence only until the budget resets on the first of the month, UTC, or you raise it — no further model requests are made.",
  none: "No budget is set, so Observer makes no model requests.",
});

/* ==================================================================== models */

function ModelPanel({
  preferences,
  connections,
  unavailable,
}: {
  preferences: Awaited<ReturnType<typeof preferencesFor>>;
  connections: Map<ProviderId, ConnectionMetadata | null>;
  unavailable: boolean;
}) {
  const unreachable = new Set(
    preferences.availability.filter((a) => a.state === "unavailable").map((a) => a.model),
  );

  /** "an" before a name that is SAID with a vowel, whatever it starts with. */
  const article = (label: string): string => (/^(a|e|i|o|u|x)/i.test(label) ? "an" : "a");

  const status = (model: ModelId): { usable: boolean; note: string } => {
    const provider = modelEntry(model).provider;
    const label = PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
    if (connections.get(provider) == null) {
      /*
       * "a OpenAI key" and "a xAI key" are what a fixed article produces.
       * The choice is made from the sound of the name rather than its spelling,
       * because xAI and Anthropic both begin with letters that do not predict
       * it — the vendors are known and few, so this is a lookup, not a rule.
       */
      return { usable: false, note: `needs ${article(label)} ${label} key` };
    }
    if (unreachable.has(model)) return { usable: false, note: "your key cannot reach this model" };
    return { usable: true, note: "" };
  };

  return (
    <section className="mp-panel" aria-labelledby="models">
      <h2 id="models">Model</h2>

      <p className="mp-panel-body">
        Which model answers your questions. You can change it for a single question from the Ask
        Observer panel; this is what it falls back to.
      </p>

      <form action={chooseModels} className="mp-fields">
        <fieldset className="mp-choices">
          <legend className="mp-label">Default model</legend>
          {catalogue().map((entry) => {
            const state = status(entry.id);
            return (
              <label className="mp-choice" key={entry.id} data-usable={state.usable}>
                <input
                  type="radio"
                  name="defaultModel"
                  value={entry.id}
                  defaultChecked={preferences.defaultModel === entry.id}
                  disabled={unavailable}
                />
                <span className="mp-choice-body">
                  <span className="mp-choice-name">
                    {entry.label}
                    {!state.usable && <span className="mp-choice-flag"> · {state.note}</span>}
                  </span>
                  <span className="mp-choice-summary">{entry.summary}</span>
                  <span className="mp-choice-price">
                    {formatMicros(entry.inputMicrosPerMillion)} in ·{" "}
                    {formatMicros(entry.outputMicrosPerMillion)} out, per million tokens
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <label className="mp-label" htmlFor="deepModel">
          Deep Report model
          <select
            className="mp-input"
            id="deepModel"
            name="deepModel"
            defaultValue={preferences.deepModel ?? ""}
            disabled={unavailable}
          >
            <option value="">Same as the default</option>
            {catalogue()
              .filter((entry) => entry.selectableForDeepReport)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
          </select>
        </label>

        <button type="submit" className="mp-btn" disabled={unavailable}>
          Save model choice
        </button>
      </form>
    </section>
  );
}

/* ================================================================= providers */

function ProviderPanel({
  connections,
  storageFailure,
  replacing,
  confirming,
}: {
  connections: Map<ProviderId, ConnectionMetadata | null>;
  storageFailure: ConnectionFailure | null;
  replacing: string | undefined;
  confirming: string | undefined;
}) {
  const blocked = storageFailure === null ? null : describeFailure(storageFailure);

  return (
    <section className="mp-panel" aria-labelledby="providers">
      <h2 id="providers">{blocked !== null ? blocked.title : "Provider keys"}</h2>

      <p className="mp-panel-body">
        {blocked !== null
          ? blocked.detail
          : "Your keys are used only for your Ask Observer requests. Each is stored encrypted and is never shown again after saving."}
      </p>

      {/*
        THE ONE INSTRUCTION, IN THE WORDS THE ANSWER SHEET USES.

        A reader arrives here from a link that says "Add your OpenAI API key",
        and until this milestone the page said it back to them. Five provider
        rows replaced the one OpenAI section and the sentence went with it —
        so somebody following the link landed on a page that never repeated
        what they had come to do. Shown only while nothing is connected,
        because after that it is no longer the next step.
      */}
      {blocked === null && [...connections.values()].every((c) => c == null) && (
        <p className="mp-panel-body mp-first-step">
          <strong>Add your OpenAI API key</strong> to start. Observer asks your questions on your
          own OpenAI account, and cannot ask any until it has one.
        </p>
      )}

      {/*
        WHO BILLS, AND FOR WHAT. Restored, not invented.

        M0.3 settled this wording deliberately: the vendor bills the account
        that owns the key, an IRIS Observer subscription is a separate thing,
        and neither sentence may imply that Observer itself is or will remain
        free. Rebuilding this panel for five providers dropped the paragraph,
        which quietly un-answered the question a reader is most entitled to
        ask before pasting a credential.

        OpenAI is named because it is the one anybody has connected and the one
        the advice below is written for; the first sentence is general, because
        every provider on this page bills the same way.
      */}
      <div className="mp-advice">
        <strong>What a provider charges, and to whom</strong>
        <p>
          OpenAI API usage is billed separately by OpenAI to the project that owns this key. Your
          IRIS Observer subscription is separate. Every other provider here bills its own account
          holder the same way.
        </p>
        <ul>
          <li>
            Create a dedicated project with the provider for Observer rather than reusing one.
          </li>
          <li>Set a monthly spending limit on it, so the worst case is bounded.</li>
          <li>
            Grant the key only the permissions Observer needs — model responses, nothing more.
          </li>
        </ul>
      </div>

      {PROVIDERS.map((provider) => {
        const connection = connections.get(provider.id) ?? null;
        const isReplacing = replacing === provider.id;
        const isConfirming = confirming === provider.id;

        return (
          <div className="mp-provider" key={provider.id}>
            <div className="mp-provider-head">
              <h3>{provider.label}</h3>
              {connection !== null && !isReplacing ? (
                <span className="mp-provider-state">
                  <span className="mp-status-dot" aria-hidden="true" />
                  Connected · <span className="mp-mask">••••{connection.lastFour}</span>
                </span>
              ) : (
                <span className="mp-provider-state" data-muted="true">
                  Not connected
                </span>
              )}
            </div>

            {connection !== null && !isReplacing ? (
              <>
                <div className="mp-row">
                  <form action={test}>
                    <input type="hidden" name="provider" value={provider.id} />
                    <button type="submit" className="mp-btn" data-weight="secondary">
                      Test connection
                    </button>
                  </form>
                  <Link
                    className="mp-btn mp-btn-link"
                    data-weight="secondary"
                    href={dynamicRoute(`/settings/ai?mode=replace&p=${provider.id}`)}
                  >
                    Replace key
                  </Link>
                  {!isConfirming && (
                    <Link
                      className="mp-btn mp-btn-link"
                      data-weight="danger"
                      href={dynamicRoute(`/settings/ai?confirm=${provider.id}`)}
                    >
                      Remove
                    </Link>
                  )}
                </div>

                {isConfirming && (
                  <div className="mp-confirm" role="group" aria-labelledby={`c-${provider.id}`}>
                    <strong id={`c-${provider.id}`}>Remove the {provider.label} key?</strong>
                    <p>
                      The stored key is deleted, not hidden. Models from this provider stop being
                      available to your account, and you will need a new key — this one was never
                      shown again after you saved it.
                    </p>
                    <div className="mp-row">
                      <form action={remove}>
                        <input type="hidden" name="provider" value={provider.id} />
                        <button type="submit" className="mp-btn" data-weight="danger">
                          Yes, remove it
                        </button>
                      </form>
                      <Link className="mp-btn mp-btn-link" href={dynamicRoute("/settings/ai")}>
                        Keep it
                      </Link>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <form action={connect} className="mp-fields">
                <input type="hidden" name="provider" value={provider.id} />
                <label className="mp-label" htmlFor={`key-${provider.id}`}>
                  {provider.label} API key
                  <input
                    className="mp-input"
                    id={`key-${provider.id}`}
                    name="apiKey"
                    type="password"
                    /*
                      A password manager should neither save nor autofill this:
                      it is an API credential, not this reader's password for
                      anything, and an autofilled value here would be somebody's
                      login secret sent to a server action.
                    */
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    required
                    disabled={blocked !== null}
                    placeholder={provider.keyHint}
                    aria-describedby={`help-${provider.id}`}
                  />
                </label>
                <p className="mp-note" id={`help-${provider.id}`}>
                  Create one at{" "}
                  <a className="mp-link" href={provider.consoleUrl} rel="noreferrer">
                    {provider.consoleUrl.replace(/^https:\/\//, "")}
                  </a>
                  . Pressing <em>Add and test</em> sends one small request to check the key works.
                  This test may create a small {provider.label} API charge.
                </p>
                <button type="submit" className="mp-btn" disabled={blocked !== null}>
                  Add and test
                </button>
                {isReplacing && (
                  <p className="mp-note">
                    <Link className="mp-link" href={dynamicRoute("/settings/ai")}>
                      Keep the current key instead
                    </Link>{" "}
                    — nothing changes until a new key is accepted.
                  </p>
                )}
              </form>
            )}
          </div>
        );
      })}

      <p className="mp-note">{ESTIMATE_CAVEAT}</p>
    </section>
  );
}
