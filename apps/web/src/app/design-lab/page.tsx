import type { Metadata } from "next";
import Link from "next/link";

import { dynamicRoute } from "@/lib/href";
import { SCREEN_NAME, SCREENS, VARIANT_NAME, VARIANTS } from "./lab-data";

export const metadata: Metadata = { title: "Design lab" };

/**
 * The index: fifteen doors in a grid, and nothing else.
 *
 * Deliberately plain. It is a signpost between the candidates, and anything
 * styled here would be a fourth direction competing with the three being
 * judged. It carries the two facts a reviewer needs before opening anything:
 * every variant reads the same estate, and every control in every variant is
 * inert.
 */
export default function DesignLabIndex() {
  return (
    <main
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        fontFamily: "var(--font-sans)",
        color: "#111",
        background: "#fff",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Design lab</h1>
      <p style={{ margin: "0 0 2rem", lineHeight: 1.55, maxWidth: "60ch" }}>
        Five screens, three directions, one read of the real control plane. Every variant sees the
        same estate at the same moment. Every control is drawn and inert, so the hierarchy can be
        judged without anything being changed.
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.875rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Screen</th>
            {VARIANTS.map((variant) => (
              <th key={variant} style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>
                {variant.toUpperCase()}. {VARIANT_NAME[variant]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCREENS.map((screen) => (
            <tr key={screen} style={{ borderTop: "1px solid rgb(17 17 17 / 9%)" }}>
              <td style={{ padding: "0.625rem 0.75rem" }}>{SCREEN_NAME[screen]}</td>
              {VARIANTS.map((variant) => (
                <td key={variant} style={{ padding: "0.625rem 0.75rem" }}>
                  <Link href={dynamicRoute(`/design-lab/${screen}/${variant}`)}>Open</Link>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
