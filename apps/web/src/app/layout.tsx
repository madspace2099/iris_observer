import type { Metadata, Viewport } from "next";
import "@observer/ui/tokens.css";
import "@observer/ui/components.css";

export const metadata: Metadata = {
  title: {
    default: "IRIS Observer",
    template: "%s · IRIS Observer",
  },
  description: "Sales intelligence for MADSPACE IRIS showroom installations.",
};

export const viewport: Viewport = {
  themeColor: "#07090c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="obs-skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
