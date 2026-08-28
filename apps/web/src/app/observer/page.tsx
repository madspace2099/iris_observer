import { redirect } from "next/navigation";
import { dynamicRoute } from "@/lib/href";

/** `/observer` is not a screen; Overview is. */
export default function ObserverIndex() {
  redirect(dynamicRoute("/observer/overview"));
}
