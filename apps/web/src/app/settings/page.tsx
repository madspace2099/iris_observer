import { redirect } from "next/navigation";

/**
 * `/settings` opens the first settings page rather than a 404. Every link into
 * settings names a page; a reader who trims the address still lands on one.
 */
export default function Settings(): never {
  redirect("/settings/ai");
}
