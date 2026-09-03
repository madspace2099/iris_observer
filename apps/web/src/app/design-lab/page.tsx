import type { Metadata } from "next";
import Link from "next/link";

import { dynamicRoute } from "@/lib/href";
import { VARIANT_NAME, VARIANTS } from "./lab-data";

export const metadata: Metadata = { title: "Design lab" };

/**
 * The index. Three doors and nothing else.
 *
 * Deliberately unstyled beyond the minimum: it is a signpost between the
 * candidates, and anything decorative here would be a fourth direction nobody
 * asked for. It carries the one warning that matters, which is that these are
 * prototypes and their controls do nothing.
 */
export default function DesignLabIndex() {
  return (
    <main
      style={{
        maxWidth: "40rem",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Source detail, three directions</h1>
      <p style={{ margin: "0 0 2rem", lineHeight: 1.55 }}>
        One screen, one read of the real control plane, three compositions. The source actions in
        every variant are inert: they are drawn so the hierarchy can be judged and they are wired to
        nothing.
      </p>
      <ul style={{ display: "grid", gap: "0.75rem", listStyle: "none", padding: 0, margin: 0 }}>
        {VARIANTS.map((variant) => (
          <li key={variant}>
            <Link href={dynamicRoute(`/madspace/design-lab/source-detail/${variant}`)}>
              {variant.toUpperCase()}. {VARIANT_NAME[variant]}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
