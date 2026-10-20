import { redirect } from "next/navigation";

/**
 * Projects and the MADSPACE home are one page now (ADR-0047). The address
 * stays, because links to it were sent and its own drill-downs live under it;
 * it lands on `/madspace`, which does its own role check.
 */
export default function MadspaceProjectsPage() {
  redirect("/madspace");
}
