import type { Metadata } from "next";

import { companyKeyState } from "@/lib/credentials/company-keys";
import { ALL_FAILURES, describeFailure, type ConnectionFailure } from "@/lib/credentials/failure";
import { welcomeDestination } from "@/lib/landing";
import { requireAccount, requireViewer } from "@/lib/session";
import { welcomeFacts, welcomeLines } from "@/lib/welcome";
import { CompanyKeyDialog } from "@/components/welcome/CompanyKeyDialog";
import { WelcomeSequence } from "@/components/welcome/WelcomeSequence";
import { saveCompanyKey } from "./actions";

export const metadata: Metadata = { title: "Welcome" };

/**
 * THE MOMENT BETWEEN SIGNING IN AND ASK IRIS.
 *
 * A password sign-in with no destination of its own lands here, carrying the
 * landing the server already resolved as `?to=`. That value came back through
 * the browser, so it is checked again rather than trusted: `welcomeDestination`
 * keeps it only if it is an internal path this account may open, and otherwise
 * resolves the landing afresh. The lines the sequence types are read from the
 * project it opens (`lib/welcome.ts`), then the reader is handed on.
 *
 * On a local demonstration with company keys (ADR-0043), a company's admin
 * whose company has no key yet is asked for one first, in a dialog over the
 * held sequence. `?key=<failure>` is the last attempt's outcome, said in the
 * dialog; `?key=skip` plays the sequence without asking, for a recording that
 * wants the welcome alone.
 *
 * Signed out, there is nothing to welcome: `requireViewer` sends the reader to
 * the sign-in, like every other screen.
 */
export default async function Welcome({
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

  const to = await welcomeDestination(viewer, first("to"));
  const facts = await welcomeFacts(viewer, to);
  const heading =
    facts.project === null
      ? `Welcome, ${viewer.displayName}`
      : `Welcome, ${viewer.displayName}. Opening ${facts.project.name}.`;

  const key = first("key");
  const company = companyKeyState(account);
  const asking =
    company !== null && company.role === "admin" && company.key === null && key !== "skip"
      ? company
      : null;
  const failure = ALL_FAILURES.includes(key as ConnectionFailure)
    ? describeFailure(key as ConnectionFailure).title
    : null;

  return (
    <>
      <WelcomeSequence
        to={to}
        lines={welcomeLines(facts)}
        heading={heading}
        hold={asking !== null}
      />
      {asking === null ? null : (
        <CompanyKeyDialog
          to={to}
          company={asking.company}
          failure={failure}
          action={saveCompanyKey}
        />
      )}
    </>
  );
}
