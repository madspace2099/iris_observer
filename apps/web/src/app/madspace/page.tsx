import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Kicker } from "@observer/ui";
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
 * competes with it. The definition of what the word "Administration" covers,
 * and the promise about code changes, moved behind the disclosure beside the
 * title: both are explanation, and explanation standing in front of the answer
 * is the thing the disclosure exists to stop. The refusal itself may never go
 * there.
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
         */}
        <p className="mad-lede">Not part of this demonstration.</p>
      </div>
    </header>
  );
}
