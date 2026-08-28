import type { Metadata } from "next";
import "@/observer-demo/demo.css";

/**
 * The Observer demonstration section.
 *
 * A separate route group with its own stylesheet, deliberately outside the
 * authenticated `(app)` tree: this surface reads a frozen fixture and never
 * touches a session, a repository or an environment variable, so putting it
 * behind the production sign-in would make it harder to show and no safer.
 */
export const metadata: Metadata = {
  title: { default: "Observer", template: "%s · IRIS Observer" },
  description: "IRIS Observer — showroom and web demand intelligence (demonstration data).",
};

export default function ObserverDemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
