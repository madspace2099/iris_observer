import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionLink, Kicker } from "@observer/ui";
import { requireViewer } from "@/lib/session";
import { InfoNote } from "@/components/madspace/InfoNote";

export const metadata: Metadata = { title: "Administration" };

/**
 * MADSPACE administration.
 *
 * A separate surface with its own shell, deliberately outside the customer
 * navigation. Tenant creation, branding, entitlements and integration health
 * are MADSPACE's business, and putting them in a customer's nav would both
 * confuse the product and invite a permission mistake.
 *
 * The shell itself moved to `layout.tsx` when the operations screens arrived —
 * three surfaces cannot each own a header — so this page is now the content it
 * always was. Note what it does NOT say any more by implication: the operations
 * screens beside it are real, read the control plane, and are not part of what
 * this page excludes.
 *
 * ## The shape, and why it is the sibling pages' shape
 *
 * A page needs one `h1` naming its subject, and every other screen under
 * /madspace already states its subject that way. This one used to lead with an
 * `h2` inside a card, so the view had no top-level heading at all. It now uses
 * the same head as Projects, Diagnostics and Source detail: kicker, title,
 * then the answer in a sentence.
 *
 * The refusal is the ANSWER, so it is the lede and nothing else on the surface
 * competes with it. The definition of what the word "Administration" covers
 * moved behind the disclosure beside the title: that is explanation, and
 * explanation standing in front of the answer is the thing the disclosure
 * exists to stop. The refusal itself may never go there.
 *
 * ## The refusal used to read as a dead end
 *
 * "Not part of this demonstration," alone, answered a question about tenants,
 * branding, users and agencies that nobody standing on this exact screen was
 * necessarily asking. An operator who came here to create a project — the one
 * write this whole surface exists to offer without a code change, per the
 * disclosure below — read the same sentence and had no way to tell those two
 * things apart. The lede now names what it refuses rather than refusing
 * everything by implication, and the one write that works is a control on the
 * page, not a fact left for `/madspace/projects` to state on its own.
 */
export default async function MadspacePage() {
  const viewer = await requireViewer();
  /*
   * Repeated here rather than left to the layout. A layout is not a security
   * boundary: Next may render a page without re-running an ancestor layout, so
   * the page does its own check. `layout.tsx` carries the same test for the
   * same reason, and neither one is redundant.
   */
  if (viewer.role !== "madspace_admin") redirect("/");

  return (
    <header className="mad-head">
      <div className="mad-head-text">
        <Kicker>MADSPACE operations</Kicker>
        {/*
         * The control is a SIBLING of the heading, never inside it.
         *
         * A button inside the `h1` joins the heading's accessible name, so this
         * view announced as "Administration About what Administration covers"
         * and the heading stopped naming the view. `mad-idline` puts the two on
         * one line without putting one inside the other.
         */}
        <div className="mad-idline">
          <h1 className="mad-title">Administration</h1>
          <InfoNote label="what Administration covers">
            <p>
              Administration covers tenants, projects, branding, users, agencies, showroom
              installations, integrations, unit import and project activation.
            </p>
            <p>
              Creating a project must never require a code change, and this is where that promise is
              kept.
            </p>
          </InfoNote>
        </div>
        {/*
         * Named for what it is, not for when it lands.
         *
         * "Arrives in M9" is internal roadmap language on a route a developer can
         * open during a consultation. It tells the reader nothing they can use
         * and quietly dates the product. The promise the surface exists to keep
         * is worth stating; the milestone number is not.
         *
         * There is no party waited on and no date beside it because nothing is
         * owed and nothing is scheduled. An invented ETA would read as one.
         *
         * The refusal now names its own scope instead of reading as a blanket
         * one. Tenants, branding, users and agencies have no table behind them
         * yet, so naming them here is the honest half of the sentence; projects,
         * their showroom sources and their CRM connections are real, which the
         * other half and the control beside it both say without being asked.
         */}
        <p className="mad-lede">
          Tenant, branding, user and agency records are not part of this demonstration. Projects,
          their showroom sources and their CRM connections are.
        </p>
      </div>

      {/*
       * The one write this whole surface promises, on the screen an operator
       * actually lands on. It used to exist only two clicks away, behind the
       * Projects tab in `OpsNav` — findable once you already knew a project
       * list was where "create one" would be, and this screen's own refusal
       * gave no reason to look for it.
       */}
      <div className="mad-head-actions">
        <ActionLink href="/madspace/projects/new" emphasis="primary">
          New project
        </ActionLink>
      </div>
    </header>
  );
}
