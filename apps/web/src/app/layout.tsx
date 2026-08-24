import type { Metadata, Viewport } from "next";
// Self-hosted from a pinned package: no runtime dependency on a third-party
// font host, the licence travels with the files, and font-display: swap comes
// from the package itself.
import "@fontsource-variable/manrope";
import "@observer/ui/tokens.css";
import "@observer/ui/components.css";
// IRIS Spatial Intelligence. Loaded after the M2.1 component sheet so the
// showroom surfaces win where the two overlap; the surfaces that have not been
// rebuilt yet keep the older layer until they are.
import "@observer/ui/iris.css";
import "@observer/ui/showroom.css";
import { environment, isStaging } from "@/lib/env";

// The startup report lives in instrumentation.ts, which Next calls once per
// server process. This module is evaluated at build time for static routes.

export const metadata: Metadata = {
  title: {
    default: "IRIS Observer",
    template: "%s · IRIS Observer",
  },
  description: "Showroom intelligence for MADSPACE IRIS installations.",
  /*
   * Staging is not indexed. The data is synthetic and the sign-in is a scenario
   * selector, so a search result pointing here would misrepresent both. The
   * response header says the same thing for crawlers that ignore the tag.
   */
  robots: isStaging() ? { index: false, follow: false, nocache: true } : undefined,
};

export const viewport: Viewport = {
  themeColor: "#07090c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const env = environment();
  return (
    <html lang="en" data-environment={env.environment} data-data-source={env.dataSource}>
      <body>
        <a className="obs-skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
