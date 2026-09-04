import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import type { Viewer } from "@observer/readmodels";
import { dynamicRoute } from "@/lib/href";
import { repository } from "@/lib/repository";
import { HOME_SEGMENT } from "@/lib/routes";
import { SESSION_COOKIE, destroySession, requireAccount, requireViewer } from "@/lib/session";
import { safeReturnTo } from "@/portal/return-to";
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
 *
 * ## IT WEARS THE PRODUCT'S CHROME, NOT THE PORTAL'S
 *
 * This was a light MADSPACE portal page — `portal.css`, `.mp-*` classes, a
 * paper ground and its own bar — sitting behind a "Settings" link in a dark
 * product. It read as a second product, which is what it looked like because it
 * was built as one.
 *
 * It now uses the same header as every project surface (`.irs-header` and its
 * parts, from `iris-shell.css`), the same graphite ground and the same content
 * system (`.ox-*`, from `observer-product.css`). `observer-settings.css` adds
 * only what neither already had.
 *
 * `portal.css` is untouched. That is deliberate and it is why the markup moved
 * off `.mp-*` rather than those classes being restyled: `/projects` and
 * `/sign-in` use the same names, and darkening them would have redesigned the
 * sign-in screen as a side effect.
 *
 * ## The shell component is NOT reused, and the reason is honesty
 *
 * `Shell` requires a `scope` — a tenant and a project — and builds its four nav
 * items from it. Account settings has no project; the credential belongs to the
 * account and is used across every project it can open. Passing a project in to
 * get the chrome would draw a navigation claiming the reader is inside
 * Northgate while they edit something that is not Northgate's.
 *
 * So the chrome is composed from the same CSS, and what differs is what is
 * genuinely different: no project nav, no context band, no period. In its place
 * the wordmark becomes the way back into the product, and a Back control names
 * where the reader came from.
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

  const origin = await originFrom(viewer, first("from"));
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

  async function signOut(): Promise<void> {
    "use server";
    const store = await cookies();
    destroySession(store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    redirect("/sign-in");
  }

  return (
    /*
     * No skip link here: `app/layout.tsx` renders the one for the whole
     * application, and `<main id="main">` below is the target it has always
     * pointed at. A second one was not merely redundant — `.irs-shell > *`
     * forces `position: relative` on every child, which took the duplicate out
     * of absolute positioning, stretched it across the flex column and pushed
     * 16px off the right edge of a 1920 viewport.
     */
    <div className="irs-shell ox-root ox-graphite">
      <header className="irs-header">
        {/*
         * THE WORDMARK, AND WHERE IT GOES.
         *
         * On a project surface it is inert, because the four sections sit
         * beside it. Here there is no nav, so it becomes the way back into the
         * product — to Ask IRIS for the project the reader came from, or for
         * the first project they can open if they arrived here cold.
         *
         * `aria-label` rather than the image's `alt` alone: a link whose only
         * text is a logo announces as "IRIS", which says what it IS and not
         * where it GOES. An account with no project at all gets no link, since
         * an entry leading to a refusal is worse than no entry.
         */}
        {origin.ask === null ? (
          <Brand />
        ) : (
          <Link
            className="irs-brand os-brand-link"
            href={dynamicRoute(origin.ask)}
            aria-label={`IRIS Observer — open Ask IRIS for ${origin.projectLabel ?? "your project"}`}
          >
            <BrandParts />
          </Link>
        )}

        <p className="os-header-title">Account settings</p>

        <div className="irs-header-end">
          <div className="irs-who">
            <div className="irs-who-name">{account.displayName}</div>
            <div className="irs-who-role">{viewer.organisationName}</div>
          </div>
          <Link className="ox-btn" data-weight="quiet" href={dynamicRoute("/projects")}>
            Projects
          </Link>
          <form action={signOut}>
            <button className="ox-btn" data-weight="quiet" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="irs-main" id="main" tabIndex={-1}>
        <div className="os-column">
          {/*
           * BACK, NAMING ITS DESTINATION.
           *
           * "← Sales Flow" rather than "← Back". The page knows where the
           * reader came from — it was told, and it checked — so saying it is
           * free, and a control that names its destination is one a reader can
           * trust without trying it. When nothing valid was supplied it says
           * "Projects", which is true rather than a guess at a project page.
           */}
          {/*
           * The arrow is decorative and hidden, so without a label this link
           * announces as just "Projects" — the same name as the one in the
           * header, going to the same place. A reader on a screen reader would
           * hear the destination twice and the RELATIONSHIP never. The label
           * carries the direction; the visible text stays the destination.
           */}
          <Link
            className="os-back"
            href={dynamicRoute(origin.back)}
            aria-label={`Back to ${origin.backLabel}`}
          >
            <svg
              className="os-back-arrow"
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            {origin.backLabel}
          </Link>

          <div className="ox-head">
            <div className="ox-head-text">
              <p className="ox-kicker">Account settings</p>
              <h1 className="ox-title">AI and usage</h1>
              <p className="ox-lede">
                Ask Observer runs on your own provider accounts. Everything here belongs to{" "}
                <strong>{account.email}</strong> and applies to every project you can open — never
                to anybody else&rsquo;s.
              </p>
            </div>
          </div>

          {done !== undefined && (
            <p className="os-flash" data-tone="ok" role="status">
              {DONE[done] ?? "Saved."}
            </p>
          )}

          {failure !== null && (
            <div className="os-flash" data-tone="bad" role="alert">
              <strong>{failure.title}</strong>
              <span>{failure.detail}</span>
            </div>
          )}

          <BudgetPanel budget={budget} unavailable={unavailable} origin={origin.from} />

          <ModelPanel
            preferences={preferences}
            connections={connections}
            unavailable={unavailable}
            origin={origin.from}
          />

          <ProviderPanel
            connections={connections}
            storageFailure={storageFailure}
            replacing={replacing}
            confirming={confirming}
            origin={origin.from}
          />
        </div>
      </main>
    </div>
  );
}

/* ===================================================================== brand */

function BrandParts() {
  return (
    <>
      {/*
       * A plain `img`, not `next/image` — the same 1.2KB vector the shell
       * draws, at the same fixed 21px height, so there is nothing to optimise
       * and a loader in front of it would only add a request.
       */}
      <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="" />
      <span className="irs-brand-sub">by MADSPACE</span>
    </>
  );
}

function Brand() {
  return (
    <div className="irs-brand">
      <img className="irs-brand-mark" src="/brand/iris-wordmark.svg" alt="IRIS" />
      <span className="irs-brand-sub" aria-label="by MADSPACE">
        by MADSPACE
      </span>
    </div>
  );
}

/* ==================================================================== origin */

/**
 * WHERE THE READER CAME FROM, AND WHERE THE WORDMARK GOES.
 *
 * One parameter answers both, so the two can never disagree — which they would
 * within a week if Back read `from` while the wordmark guessed at the first
 * project.
 *
 * Two checks, and they prove different things:
 *
 *   `safeReturnTo` proves the SHAPE. It is an allow-list of route families on
 *   this origin, written for exactly this hazard: a value the browser controls,
 *   handed to a link. A scheme, a protocol-relative `//host`, a backslash, a
 *   query, a fragment or a route this application does not serve all resolve to
 *   null, which means "use the default" and never "use it anyway".
 *
 *   `resolveProject` proves the GRANT. A reader can hand-edit
 *   `?from=/rival/tower/ask` — a perfectly well-shaped path — and the allow-list
 *   has no opinion on whether they may open it. Only the repository does. It
 *   refuses identically for forbidden and missing, so this cannot be used to
 *   discover that a project exists.
 */
type Origin = {
  /** The validated `from`, for carrying through a form. Empty when there is none. */
  readonly from: string;
  /** Where Back goes. Always a real destination. */
  readonly back: string;
  /** What Back is called. Names the destination rather than saying "Back". */
  readonly backLabel: string;
  /** Ask IRIS for the project in context, or null if the account holds none. */
  readonly ask: string | null;
  readonly projectLabel: string | null;
};

const SECTION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  ask: "Ask IRIS",
  flow: "Sales Flow",
  project: "Project",
  agents: "Sales Agents",
  showroom: "Briefing",
  units: "Units",
  meetings: "Meetings",
  attention: "Unit Attention",
  features: "Features",
  presentation: "Presentation DNA",
  storytelling: "Storytelling",
  audience: "Audience",
  people: "People",
  overview: "Overview",
});

async function originFrom(viewer: Viewer, raw: string | undefined): Promise<Origin> {
  const from = safeReturnTo(raw);

  if (from === "/projects") {
    const fallback = await firstProject(viewer);
    return {
      from,
      back: "/projects",
      backLabel: "Projects",
      ask: fallback?.ask ?? null,
      projectLabel: fallback?.label ?? null,
    };
  }

  if (from !== null) {
    /* `/tenant/project/section…` — the allow-list guarantees at least three. */
    const [, tenantSlug = "", projectSlug = "", section = ""] = from.split("/");
    try {
      const { tenant, project } = await repository.resolveProject(viewer, tenantSlug, projectSlug);
      return {
        from,
        back: from,
        backLabel: SECTION_LABEL[section] ?? project.name,
        ask: `/${tenant.slug}/${project.slug}/${HOME_SEGMENT}`,
        projectLabel: project.name,
      };
    } catch {
      /*
       * Well-formed and not theirs. Fall through to the default rather than
       * refusing: the reader asked for their settings, which they may have, and
       * the only thing that failed is a hint about where they had been.
       */
    }
  }

  const fallback = await firstProject(viewer);
  return {
    from: "",
    back: "/projects",
    backLabel: "Projects",
    ask: fallback?.ask ?? null,
    projectLabel: fallback?.label ?? null,
  };
}

/**
 * The first project this account may open, or null.
 *
 * Asked of the repository so the wordmark is a grant rather than a guess, and
 * so an account with none simply does not get the link — an entry leading to a
 * refusal is worse than no entry.
 */
async function firstProject(viewer: Viewer): Promise<{ ask: string; label: string } | null> {
  const tenants = await repository.listTenants(viewer);
  for (const tenant of tenants) {
    const projects = await repository.listProjects(viewer, tenant.id);
    const project = projects[0];
    // The home segment, not a named screen — ADR-0033 owns which one that is.
    if (project !== undefined) {
      return { ask: `/${tenant.slug}/${project.slug}/${HOME_SEGMENT}`, label: project.name };
    }
  }
  return null;
}

/**
 * The context, carried through a form so it survives the redirect.
 *
 * Every action on this page redirects back to `/settings/ai?done=…`, which
 * would drop `from` and silently strip the reader of their Back control the
 * first time they saved anything. The actions read this field and put it back.
 */
function CarryOrigin({ origin }: { origin: string }) {
  if (origin === "") return null;
  return <input type="hidden" name="from" value={origin} />;
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
 * A settings link that keeps the reader's origin.
 *
 * Every in-page link — Replace key, Remove, Keep it — navigates back to this
 * same route, so each one has to carry `from` or the reader loses their way
 * back the first time they touch a control.
 */
function here(origin: string, query: string): string {
  const carry = origin === "" ? "" : `from=${encodeURIComponent(origin)}`;
  const parts = [query, carry].filter((part) => part !== "");
  return parts.length === 0 ? "/settings/ai" : `/settings/ai?${parts.join("&")}`;
}

/* ==================================================================== budget */

function BudgetPanel({
  budget,
  unavailable,
  origin,
}: {
  budget: Awaited<ReturnType<typeof budgetFor>>;
  unavailable: boolean;
  origin: string;
}) {
  const dollars = budget === null ? 0 : budget.usage.budgetMicros / MICROS_PER_DOLLAR;

  return (
    <section className="ox-panel ox-panel-pad os-column" aria-labelledby="budget">
      <div className="ox-section-head">
        <h2 className="ox-section-title" id="budget">
          Monthly Observer budget
        </h2>
      </div>

      <p className="ox-section-note">
        A ceiling on what Observer estimates your questions will cost this calendar month, in US
        dollars. It resets at the start of each month, UTC.
      </p>

      {budget !== null && budget.usage.budgetMicros > 0 && (
        <>
          <div className="ox-track">
            <div
              className="ox-track-fill"
              style={{ width: `${Math.min(100, budget.usedPercent)}%` }}
              aria-hidden="true"
            />
          </div>

          <dl className="os-facts">
            <div>
              <dt>Used</dt>
              <dd>
                {formatMicros(budget.usage.spentMicros + budget.usage.reservedMicros)}{" "}
                <span className="os-percent">({budget.usedPercent}%)</span>
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
            <p className="os-threshold" data-threshold={budget.threshold} role="status">
              {THRESHOLD_TEXT[budget.threshold]}
            </p>
          )}
        </>
      )}

      <form action={chooseBudget} className="os-form-row">
        <CarryOrigin origin={origin} />
        <label className="ox-field" htmlFor="budget-input">
          <span className="ox-field-label">Monthly budget in USD</span>
          <input
            className="ox-input"
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
        <button type="submit" className="ox-btn" data-weight="primary" disabled={unavailable}>
          Save budget
        </button>
      </form>

      <div className="os-advice">
        <strong>What this figure is</strong>
        <p>{ESTIMATE_CAVEAT}</p>
        {PRICES_VERIFIED ? (
          <p>
            Catalogue {CATALOGUE_VERSION}, priced from OpenAI&rsquo;s published rates as read on{" "}
            {PRICES_VERIFIED_AT} at{" "}
            <a className="os-link" href={PRICE_SOURCE_URL} rel="noreferrer noopener" target="_blank">
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
  origin,
}: {
  preferences: Awaited<ReturnType<typeof preferencesFor>>;
  connections: Map<ProviderId, ConnectionMetadata | null>;
  unavailable: boolean;
  origin: string;
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
    <section className="ox-panel ox-panel-pad os-column" aria-labelledby="models">
      <div className="ox-section-head">
        <h2 className="ox-section-title" id="models">
          Model
        </h2>
      </div>

      <p className="ox-section-note">
        Which model answers your questions. You can change it for a single question from the Ask
        Observer panel; this is what it falls back to.
      </p>

      <form action={chooseModels} className="os-column">
        <CarryOrigin origin={origin} />

        <fieldset className="os-choices">
          <legend className="ox-field-label">Default model</legend>
          {catalogue().map((entry) => {
            const state = status(entry.id);
            return (
              <label className="os-choice" key={entry.id} data-usable={state.usable}>
                <input
                  type="radio"
                  name="defaultModel"
                  value={entry.id}
                  defaultChecked={preferences.defaultModel === entry.id}
                  disabled={unavailable}
                />
                <span className="os-choice-body">
                  <span className="os-choice-name">
                    {entry.label}
                    {!state.usable && <span className="os-choice-flag"> · {state.note}</span>}
                  </span>
                  <span className="os-choice-summary">{entry.summary}</span>
                  <span className="os-choice-price">
                    {formatMicros(entry.inputMicrosPerMillion)} in ·{" "}
                    {formatMicros(entry.outputMicrosPerMillion)} out, per million tokens
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <label className="ox-field" htmlFor="deepModel">
          <span className="ox-field-label">Deep Report model</span>
          <select
            className="ox-select"
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

        <div className="ox-btn-row">
          <button type="submit" className="ox-btn" data-weight="primary" disabled={unavailable}>
            Save model choice
          </button>
        </div>
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
  origin,
}: {
  connections: Map<ProviderId, ConnectionMetadata | null>;
  storageFailure: ConnectionFailure | null;
  replacing: string | undefined;
  confirming: string | undefined;
  origin: string;
}) {
  const blocked = storageFailure === null ? null : describeFailure(storageFailure);

  return (
    <section className="ox-panel ox-panel-pad os-column" aria-labelledby="providers">
      <div className="ox-section-head">
        <h2 className="ox-section-title" id="providers">
          {blocked !== null ? blocked.title : "Provider keys"}
        </h2>
      </div>

      <p className="ox-section-note">
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
        <p className="ox-lede">
          <strong>Add your OpenAI API key</strong> to start. Observer asks your questions on your own
          OpenAI account, and cannot ask any until it has one.
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
      <div className="os-advice">
        <strong>What a provider charges, and to whom</strong>
        <p>
          OpenAI API usage is billed separately by OpenAI to the project that owns this key. Your
          IRIS Observer subscription is separate. Every other provider here bills its own account
          holder the same way.
        </p>
        <ul>
          <li>Create a dedicated project with the provider for Observer rather than reusing one.</li>
          <li>Set a monthly spending limit on it, so the worst case is bounded.</li>
          <li>Grant the key only the permissions Observer needs — model responses, nothing more.</li>
        </ul>
      </div>

      {PROVIDERS.map((provider) => {
        const connection = connections.get(provider.id) ?? null;
        const isReplacing = replacing === provider.id;
        const isConfirming = confirming === provider.id;

        return (
          <div className="os-provider" key={provider.id}>
            <div className="os-provider-head">
              <h3 className="os-provider-name">{provider.label}</h3>
              {connection !== null && !isReplacing ? (
                <span className="os-provider-state">
                  <span className="os-dot" aria-hidden="true" />
                  Connected · <span className="os-mask">••••{connection.lastFour}</span>
                </span>
              ) : (
                <span className="os-provider-state" data-muted="true">
                  <span className="os-dot" aria-hidden="true" />
                  Not connected
                </span>
              )}
            </div>

            {connection !== null && !isReplacing ? (
              <>
                <div className="ox-btn-row">
                  <form action={test}>
                    <CarryOrigin origin={origin} />
                    <input type="hidden" name="provider" value={provider.id} />
                    <button type="submit" className="ox-btn">
                      Test connection
                    </button>
                  </form>
                  <Link
                    className="ox-btn"
                    href={dynamicRoute(here(origin, `mode=replace&p=${provider.id}`))}
                  >
                    Replace key
                  </Link>
                  {!isConfirming && (
                    <Link
                      className="ox-btn"
                      href={dynamicRoute(here(origin, `confirm=${provider.id}`))}
                    >
                      Remove
                    </Link>
                  )}
                </div>

                {isConfirming && (
                  <div className="os-confirm" role="group" aria-labelledby={`c-${provider.id}`}>
                    <strong id={`c-${provider.id}`}>Remove the {provider.label} key?</strong>
                    <p>
                      The stored key is deleted, not hidden. Models from this provider stop being
                      available to your account, and you will need a new key — this one was never
                      shown again after you saved it.
                    </p>
                    <div className="ox-btn-row">
                      <form action={remove}>
                        <CarryOrigin origin={origin} />
                        <input type="hidden" name="provider" value={provider.id} />
                        <button type="submit" className="ox-btn">
                          Yes, remove it
                        </button>
                      </form>
                      <Link className="ox-btn" href={dynamicRoute(here(origin, ""))}>
                        Keep it
                      </Link>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <form action={connect} className="os-column">
                <CarryOrigin origin={origin} />
                <input type="hidden" name="provider" value={provider.id} />
                <label className="ox-field" htmlFor={`key-${provider.id}`}>
                  <span className="ox-field-label">{provider.label} API key</span>
                  <input
                    className="ox-input"
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
                <p className="os-note" id={`help-${provider.id}`}>
                  Create one at{" "}
                  <a className="os-link" href={provider.consoleUrl} rel="noreferrer">
                    {provider.consoleUrl.replace(/^https:\/\//, "")}
                  </a>
                  . Pressing <em>Add and test</em> sends one small request to check the key works.
                  This test may create a small {provider.label} API charge.
                </p>
                <div className="ox-btn-row">
                  <button
                    type="submit"
                    className="ox-btn"
                    data-weight="primary"
                    disabled={blocked !== null}
                  >
                    Add and test
                  </button>
                </div>
                {isReplacing && (
                  <p className="os-note">
                    <Link className="os-link" href={dynamicRoute(here(origin, ""))}>
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

      <p className="os-note">{ESTIMATE_CAVEAT}</p>
    </section>
  );
}
