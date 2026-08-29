import Link from "next/link";
import type { Metadata } from "next";

import { dynamicRoute } from "@/lib/href";
import type { Viewer } from "@observer/readmodels";
import { repository } from "@/lib/repository";
import { requireAccount, requireViewer } from "@/lib/session";
import { connectionFor } from "@/lib/credentials/service";
import { describeFailure, type ConnectionFailure } from "@/lib/credentials/failure";
import { connect, remove, test } from "./actions";
import "@/portal/portal.css";

export const metadata: Metadata = { title: "OpenAI connection" };

/**
 * ACCOUNT SETTINGS — THE OPENAI CONNECTION.
 *
 * The light MADSPACE Client Portal identity, the same layer the sign-in and the
 * projects page use. Everything here belongs to the authenticated ACCOUNT: not
 * to a project, not to a developer, not to a browser session. Two people who
 * share a project have two connections and neither can see, test, replace,
 * remove or spend the other's.
 *
 * ## Nothing on this page is a secret
 *
 * The server component reads `connectionFor(accountId)`, which returns
 * metadata — provider, last four characters, timestamps — and cannot return a
 * key because it never decrypts one. So this page's HTML is safe by
 * construction rather than by remembering to redact.
 *
 * The form is plain and uncontrolled: `<input type="password" name="apiKey">`
 * with no React state behind it. The value exists in the DOM until the form is
 * submitted to a server action, and nowhere else. There is no Reveal, no Copy,
 * and no GET endpoint that could produce the value afterwards, because after
 * saving nothing in this system can.
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

  /*
   * Where "Observer" in the bar leads.
   *
   * The first project this account holds, asked of the repository so the link
   * is a grant rather than a guess. Null for an account with none, and the
   * link is then not rendered — an entry that leads to a refusal is worse than
   * no entry.
   */
  const home = await firstProject(viewer);

  const state = await connectionFor(account.accountId);
  const done = first("done");
  const failed = first("failed") as ConnectionFailure | undefined;
  const confirming = first("confirm") === "remove";
  const replacing = first("mode") === "replace";

  const failure = failed === undefined ? null : describeFailure(failed);

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
            {/*
              Both ways out, named. A settings page reached from inside a
              project must not strand a reader there: Projects is the selector,
              and Observer is the project they came from, resolved server-side
              from their own grants rather than remembered in a cookie.
            */}
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
          Ask Observer runs on your own OpenAI account. The key below belongs to{" "}
          <strong>{account.email}</strong> and is used for your questions on every project you can
          open — never for anybody else&rsquo;s.
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

        {state.kind === "unavailable" ? (
          <AddKey replacing={false} unavailable={state.failure} />
        ) : state.kind === "connected" && !replacing ? (
          <Connected
            lastFour={state.connection.lastFour}
            updatedAt={state.connection.updatedAt}
            lastTestedAt={state.connection.lastTestedAt}
            confirming={confirming}
          />
        ) : (
          <AddKey replacing={state.kind === "connected"} unavailable={null} />
        )}
      </main>
    </div>
  );
}

/**
 * The first project this account may open, or null.
 *
 * Asked of the repository so the "Observer" link in the bar is a grant rather
 * than a guess, and so an account with none simply does not get the link — an
 * entry that leads to a refusal is worse than no entry.
 */
async function firstProject(viewer: Viewer): Promise<{ href: string } | null> {
  const tenants = await repository.listTenants(viewer);
  for (const tenant of tenants) {
    const projects = await repository.listProjects(viewer, tenant.id);
    const first = projects[0];
    if (first !== undefined) return { href: `/${tenant.slug}/${first.slug}/showroom` };
  }
  return null;
}

const DONE: Readonly<Record<string, string>> = Object.freeze({
  connected: "Connected. Ask Observer now runs on your OpenAI account.",
  replaced: "Key replaced. The previous one is gone.",
  tested: "Tested. The connection works.",
  removed: "Connection removed. The stored key has been deleted.",
});

/* ============================================================== the three states */

/**
 * The form, in both of the states that show one.
 *
 * When the server cannot hold a credential the form is still rendered and
 * every control is disabled, above the sentence saying why. Hiding it would
 * leave a reader wondering whether the feature exists; showing it inert says
 * exactly what would be possible and what is not.
 */
function AddKey({
  replacing,
  unavailable,
}: {
  replacing: boolean;
  unavailable: ConnectionFailure | null;
}) {
  const disabled = unavailable !== null;
  const blocked = unavailable === null ? null : describeFailure(unavailable);

  return (
    <section className="mp-panel" aria-labelledby="connection">
      <h2 id="connection">
        {blocked !== null
          ? blocked.title
          : replacing
            ? "Replace your OpenAI API key"
            : "Add your OpenAI API key"}
      </h2>

      <p className="mp-panel-body">
        {blocked !== null
          ? blocked.detail
          : "Your key is used only for your Ask Observer requests. It is stored encrypted and is never shown again after saving."}
      </p>

      {blocked !== null && (
        <p className="mp-note" style={{ marginBottom: 20 }}>
          Ask Observer still answers from measured evidence: every figure on the analytical screens
          is computed and cited as usual, and the written interpretation is the deterministic
          composer&rsquo;s.
        </p>
      )}

      <form action={connect} className="mp-fields">
        <label className="mp-label" htmlFor="apiKey">
          OpenAI API key
          <input
            className="mp-input"
            id="apiKey"
            name="apiKey"
            type="password"
            /*
              A password manager should not offer to save this and should not
              autofill it: it is an API credential, not this reader's password
              for anything, and an autofilled value here would be somebody's
              login secret sent to a server action.
            */
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            required
            disabled={disabled}
            placeholder="Paste the key from your OpenAI dashboard"
            aria-describedby="key-help"
          />
        </label>

        <p className="mp-note" id="key-help">
          Create one at{" "}
          <a className="mp-link" href="https://platform.openai.com/api-keys" rel="noreferrer">
            platform.openai.com/api-keys
          </a>
          . Pressing <em>Add and test</em> sends one small request to OpenAI to check the key works.
          This test may create a small OpenAI API charge.
        </p>

        <button type="submit" className="mp-btn" disabled={disabled}>
          Add and test
        </button>

        {replacing && (
          <p className="mp-note">
            <Link className="mp-link" href={dynamicRoute("/settings/ai")}>
              Keep the current key instead
            </Link>{" "}
            — nothing changes until a new key is accepted.
          </p>
        )}
      </form>

      <div className="mp-advice">
        <strong>What OpenAI charges, and to whom</strong>
        <p>
          OpenAI API usage is billed separately by OpenAI to the project that owns this key. Your
          IRIS Observer subscription is separate.
        </p>
        <ul>
          <li>Create a dedicated OpenAI project for Observer rather than reusing another one.</li>
          <li>Set a monthly spending limit on it, so the worst case is bounded.</li>
          <li>
            Grant the key only the permissions Observer needs — model responses, nothing more.
          </li>
        </ul>
      </div>
    </section>
  );
}

function Connected({
  lastFour,
  updatedAt,
  lastTestedAt,
  confirming,
}: {
  lastFour: string;
  updatedAt: string;
  lastTestedAt: string | null;
  confirming: boolean;
}) {
  return (
    <section className="mp-panel" aria-labelledby="connection">
      <div className="mp-status">
        <span className="mp-status-dot" aria-hidden="true" />
        <h2 id="connection">Connected</h2>
      </div>

      <dl className="mp-facts">
        <div>
          <dt>Key</dt>
          {/*
            Four characters and four bullets. There is no Reveal and no Copy,
            here or anywhere: after saving, nothing in this system can produce
            the value — the settings path never decrypts, and the one function
            that does is on the model request path and returns to a provider
            client, not to a page.
          */}
          <dd className="mp-mask">
            <span aria-hidden="true">••••</span>
            <span className="obs-sr">ending in </span>
            {lastFour}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            <ObserverDate iso={updatedAt} />
          </dd>
        </div>
        <div>
          <dt>Last tested</dt>
          <dd>{lastTestedAt === null ? "Not yet" : <ObserverDate iso={lastTestedAt} />}</dd>
        </div>
      </dl>

      <div className="mp-row">
        <form action={test}>
          <button type="submit" className="mp-btn" data-weight="secondary">
            Test connection
          </button>
        </form>

        <Link
          className="mp-btn mp-btn-link"
          data-weight="secondary"
          href={dynamicRoute("/settings/ai?mode=replace")}
        >
          Replace key
        </Link>

        {!confirming && (
          <Link
            className="mp-btn mp-btn-link"
            data-weight="danger"
            href={dynamicRoute("/settings/ai?confirm=remove")}
          >
            Remove connection
          </Link>
        )}
      </div>

      {confirming && (
        <div className="mp-confirm" role="group" aria-labelledby="confirm-remove">
          <strong id="confirm-remove">Remove this connection?</strong>
          <p>
            The stored key is deleted, not hidden. Observer stops answering with a model for your
            account until you connect another one, and you will need a new key from OpenAI — this
            one was never shown again after you saved it.
          </p>
          <div className="mp-row">
            <form action={remove}>
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

      <p className="mp-note">
        OpenAI API usage is billed separately by OpenAI to the project that owns this key. Your IRIS
        Observer subscription is separate.
      </p>
    </section>
  );
}

/**
 * A date, formatted by `Intl` rather than by hand.
 *
 * `dateStyle: "medium"` in the reader's own locale, with the ISO value on the
 * element so a machine reading the page gets something unambiguous.
 */
function ObserverDate({ iso }: { iso: string }) {
  const parsed = new Date(iso);
  const label = Number.isNaN(parsed.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
  return <time dateTime={iso}>{label}</time>;
}
