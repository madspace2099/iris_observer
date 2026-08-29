import { redirect } from "next/navigation";
import { dynamicRoute } from "@/lib/href";
import { currentAccount } from "@/lib/session";

/**
 * The entry point, which now chooses nothing.
 *
 * It used to send a reader straight into their first accessible project. That
 * was defensible when a session was a persona and most personas held one
 * project; it is wrong now. An account with two developments would be dropped
 * into one of them with no indication that the other existed, and an account
 * with one would never learn that opening a project is a decision it makes.
 *
 * Both go to the same place: the project selector.
 */
export default async function Home() {
  redirect(dynamicRoute((await currentAccount()) === null ? "/sign-in" : "/projects"));
}
