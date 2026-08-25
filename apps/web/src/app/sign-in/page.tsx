import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SIGN_IN_OPTIONS,
  createSession,
  isKnownViewerKey,
} from "@/lib/session";
import { ProfilePicker, type Profile, type ProfileGroup } from "@/showroom/ProfilePicker";

export const metadata: Metadata = { title: "Choose a profile" };

/**
 * Choosing who to be.
 *
 * The session mechanics are real: a server action, an http-only cookie and a
 * redirect. The identity provider is not connected yet, so instead of a
 * password field this offers the roles the product serves — which is also the
 * most useful thing a reviewer can be handed, because the difference between
 * those views *is* the product.
 *
 * The surface is the IRIS profile picker the showroom itself opens on, and the
 * one already drawn in the Figma file, rather than a stacked list of text rows.
 * The stacked list was still deployed, and it was the first thing a developer
 * saw in a consultation.
 */
const GROUP_BY_ROLE: Record<string, ProfileGroup> = {
  sales_agent: "sales",
  agency_manager: "management",
  developer: "management",
  madspace_admin: "madspace",
};

const LABEL_BY_ROLE: Record<string, string> = {
  sales_agent: "Sales agent",
  agency_manager: "Agency manager",
  developer: "Developer",
  madspace_admin: "Administrator",
};

export default function SignIn() {
  async function signIn(formData: FormData) {
    "use server";
    const key = String(formData.get("viewer") ?? "");
    if (!isKnownViewerKey(key)) redirect("/sign-in?error=unknown");

    // The browser receives an opaque identifier, never the role. Editing the
    // cookie can only invalidate the session, not upgrade it.
    const store = await cookies();
    store.set(SESSION_COOKIE, createSession(key), SESSION_COOKIE_OPTIONS);
    redirect("/");
  }

  /*
   * The profiles are the real viewer table, not a list written for the picture.
   *
   * Every name, role, organisation and figure on a card is a fact the
   * application already holds, and the project count is what that viewer can
   * actually see. No photographs: a monogram is deterministic and true, and
   * inventing faces for people who do not exist is the fabrication this product
   * exists to argue against.
   */
  const profiles: readonly Profile[] = SIGN_IN_OPTIONS.map(({ key, viewer, blurb }) => ({
    key,
    name: viewer.displayName,
    role: LABEL_BY_ROLE[viewer.role] ?? viewer.role,
    organisation: viewer.organisationName,
    group: GROUP_BY_ROLE[viewer.role] ?? "management",
    stats: [
      { label: "Projects", value: String(viewer.projectIds.length) },
      { label: "Developers", value: String(viewer.tenantIds.length) },
    ],
    blurb,
    submitValue: key,
  }));

  return (
    <form action={signIn}>
      <ProfilePicker
        profiles={profiles}
        note="A demonstration running on synthetic data. Each profile sees a different Observer — that difference is the product."
      />
    </form>
  );
}
