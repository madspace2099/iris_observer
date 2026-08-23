import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IRIS Observer",
  description: "Sales intelligence for MADSPACE IRIS showroom installations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
