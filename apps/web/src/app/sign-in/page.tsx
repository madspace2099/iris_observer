import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { dynamicRoute } from "@/lib/href";
import { DEMO_PASSWORD, authenticate, demoAccountsEnabled, demoDirectory } from "@/lib/accounts";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  createAccountSession,
  currentAccount,
} from "@/lib/session";
import { LoginHero } from "@/portal/LoginHero";
import { safeReturnTo } from "@/portal/return-to";
import "@/portal/portal.css";

export const metadata: Metadata = { title: "Sign in" };

/**
 * THE ACCOUNT SIGN-IN.
 *
 * The outer layer that was missing. Before this, choosing a card on a profile
 * screen minted a session — which meant the product had no notion of "who
 * signed in", only "which perspective is being shown". Those are different
 * questions and they now have different answers: this page authenticates an
 * ACCOUNT, and what that account may see is read from the account on the
 * server, never from anything the browser sends.
 *
 * The composition is the MADSPACE Client Portal sign-in, transcribed from the
 * reference build: two equal columns, a 48px inset, the four-stage scrim, a
 * 360px form on the warm off-white, and the same nine-part anatomy — eyebrow,
 * heading, work email, company single sign-on, "or password", password,
 * password sign-in, invitation, protocol note.
 *
 * What is deliberately NOT transcribed is its client-side authentication. The
 * check happens in a server action; nothing about the credential reaches the
 * browser bundle.
 */
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  /* Already signed in: the picker is gone, so the destination is the projects. */
  if ((await currentAccount()) !== null) {
    redirect(dynamicRoute(safeReturnTo(first("returnTo")) ?? "/projects"));
  }

  const error = first("error");
  const returnTo = safeReturnTo(first("returnTo"));
  const enabled = demoAccountsEnabled();
  const directory = demoDirectory();

  async function signIn(formData: FormData): Promise<void> {
    "use server";

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const wanted = safeReturnTo(String(formData.get("returnTo") ?? ""));
    const suffix = wanted === null ? "" : `&returnTo=${encodeURIComponent(wanted)}`;

    const result = authenticate(email, password);
    if (!result.ok) redirect(dynamicRoute(`/sign-in?error=${result.reason}${suffix}`));

    const store = await cookies();
    store.set(SESSION_COOKIE, createAccountSession(result.account.accountId), {
      ...SESSION_COOKIE_OPTIONS,
    });

    /*
     * Every account lands on the projects, including one with a single project.
     * Opening a project is a decision a reader makes, not one made for them.
     */
    redirect(dynamicRoute(wanted ?? "/projects"));
  }

  /**
   * The two actions Observer cannot yet perform.
   *
   * Company single sign-on and invitation redemption need an identity provider
   * that is not connected. They stay on the screen because the anatomy is the
   * reference's, and they say so plainly rather than pretending: an action that
   * silently does nothing is worse than one that explains itself.
   */
  async function notConnected(formData: FormData): Promise<void> {
    "use server";
    const which = String(formData.get("which") ?? "sso");
    redirect(dynamicRoute(`/sign-in?error=${which === "invite" ? "invite" : "sso"}`));
  }

  return (
    <div className="mp">
      <a className="mp-skip" href="#main">
        Skip to content
      </a>

      <div className="mp-login">
        <LoginHero
          eyebrow="MADSPACE"
          line="One record of what happened in the showroom, for every development."
          note="Observer reads what buyers did — it does not guess what they wanted."
        />

        <main className="mp-login-panel" id="main" tabIndex={-1}>
          <div className="mp-form">
            <p className="mp-eyebrow">IRIS Observer</p>
            <h1 className="mp-title">Sign in</h1>

            {error !== undefined && (
              <div
                className="mp-alert"
                role="alert"
                id="sign-in-error"
                style={{ marginBottom: 12 }}
              >
                {MESSAGES[error] ?? MESSAGES["invalid"]}
              </div>
            )}

            <form action={signIn} className="mp-fields">
              {returnTo !== null && <input type="hidden" name="returnTo" value={returnTo} />}

              {/*
                THE DEFAULT SUBMIT, FIRST IN THE FORM AND INVISIBLE.

                Pressing Enter in a field submits through the form s FIRST submit
                button, not through its action. The first visible button here is
                company single sign-on, so a reader who typed an address and a
                password and pressed Enter was told that single sign-on is not
                connected — which is true, and not what they asked for.

                A hidden button carrying the form s own action puts the keyboard
                back on the password path without moving anything on screen.
              */}
              <button type="submit" className="obs-sr" tabIndex={-1} aria-hidden="true">
                Sign in with password
              </button>

              <label className="mp-label" htmlFor="email">
                Work email address
                <input
                  className="mp-input"
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@company.example"
                  aria-invalid={error !== undefined}
                  {...(error === undefined ? {} : { "aria-describedby": "sign-in-error" })}
                />
              </label>

              <button
                type="submit"
                className="mp-btn"
                formAction={notConnected}
                formNoValidate
                name="which"
                value="sso"
              >
                Continue with company single sign-on
              </button>

              <div className="mp-divider">
                <span>or password</span>
              </div>

              <label className="mp-label" htmlFor="password">
                Password
                <input
                  className="mp-input"
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={error !== undefined}
                  {...(error === undefined ? {} : { "aria-describedby": "sign-in-error" })}
                />
              </label>

              <button type="submit" className="mp-btn" data-weight="secondary">
                Sign in with password
              </button>

              <button
                type="submit"
                className="mp-btn"
                data-weight="link"
                formAction={notConnected}
                formNoValidate
                name="which"
                value="invite"
              >
                I have an invitation: set up my access →
              </button>

              <p className="mp-note">
                SAML 2.0 and OAuth 2.0 / OIDC are the intended protocols. No identity provider is
                connected to this build, so single sign-on and invitations are not yet available.
              </p>
            </form>

            {enabled ? (
              <div className="mp-demo">
                <strong>Demonstration accounts</strong>
                Synthetic data, and these are not credentials for anything real. Password{" "}
                <code>{DEMO_PASSWORD}</code> for any of:
                <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>
                  {directory.map((account) => (
                    <li key={account.email}>
                      <code>{account.email}</code> — {account.displayName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mp-demo">
                <strong>No accounts configured</strong>
                This server holds no account directory, so nothing can sign in. Real identity is a
                later milestone; until then a demonstration directory can be switched on for a local
                review.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * What a reader is told, and what they are not.
 *
 * An unknown address and a wrong password produce the same sentence, because a
 * form that tells them apart tells anybody who asks which addresses exist.
 */
const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  invalid: "That email address and password do not match an account.",
  unavailable:
    "No account directory is configured on this server, so there is nothing to sign in to.",
  sso: "Company single sign-on is not connected to this build. Use a password for now.",
  invite: "Invitations are not connected to this build. Ask MADSPACE to set your account up.",
});
