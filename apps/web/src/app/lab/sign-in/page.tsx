import type { Metadata } from "next";
import { ProfilePicker, type Profile, type ProfileGroup } from "@/showroom/ProfilePicker";
import { SIGN_IN_OPTIONS } from "@/lib/session";

export const metadata: Metadata = { title: "Profile picker" };

/**
 * Observer's profile picker.
 *
 * The showroom opens on a Netflix-style chooser — the agent picks themselves
 * and steps into IRIS — so Observer opens the same way, assembled from
 * components that already exist in the Figma file rather than from new ones.
 * See `ProfilePicker` for the node references and `docs/13-figma-adoption-matrix.md` §5.
 *
 * The profiles come from the real viewer table, not from a list written for the
 * picture. Every name, role, organisation and figure on a card is a fact the
 * application already holds; the number of projects is what that viewer can
 * actually see. Adding a photogenic fifth agent would be the fabrication this
 * product exists to argue against.
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

export default function LabSignIn() {
  const profiles: readonly Profile[] = SIGN_IN_OPTIONS.map(({ key, viewer, blurb }) => ({
    key,
    name: viewer.displayName,
    role: LABEL_BY_ROLE[viewer.role] ?? viewer.role,
    organisation: viewer.organisationName,
    group: GROUP_BY_ROLE[viewer.role] ?? "management",
    stats: [
      { label: "Projects", value: String(viewer.projectIds.length) },
      { label: "Tenants", value: String(viewer.tenantIds.length) },
    ],
    blurb,
    // The laboratory demonstrates the surface only. The real session adapter is
    // untouched and still issues an opaque server session (ADR-0022); nothing
    // here grants access to anything.
    href: viewer.role === "sales_agent" ? "/lab/overview-b" : "/lab/overview-a",
  }));

  return <ProfilePicker profiles={profiles} />;
}
