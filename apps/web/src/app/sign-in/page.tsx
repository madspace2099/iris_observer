import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Badge, Card } from "@observer/ui";
import { SESSION_COOKIE, SIGN_IN_OPTIONS } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign-in.
 *
 * The session mechanics are real: a server action, an http-only cookie, and a
 * redirect. The identity provider is not connected yet, so instead of a
 * password field this offers the four roles the product serves — which is also
 * the most useful thing a reviewer can be handed, because the difference
 * between these four views *is* the product.
 */
export default function SignIn() {
  async function signIn(formData: FormData) {
    "use server";
    const key = String(formData.get("viewer") ?? "");
    if (!SIGN_IN_OPTIONS.some((option) => option.key === key)) {
      redirect("/sign-in?error=unknown");
    }
    const store = await cookies();
    store.set(SESSION_COOKIE, key, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 8,
    });
    redirect("/");
  }

  return (
    <main className="obs-shell" id="main">
      <div
        className="obs-main"
        style={{ maxWidth: "48rem", justifyContent: "center", minHeight: "100dvh" }}
      >
        <div>
          <p className="obs-kicker">IRIS Observer</p>
          <h1 style={{ margin: 0, fontSize: "var(--text-h5)", letterSpacing: "-0.02em" }}>
            Sign in
          </h1>
          <p className="obs-muted" style={{ maxWidth: "56ch" }}>
            Authentication is not connected in this build. Choose the role you want to review the
            product as — each one sees a different Observer, which is the point.
          </p>
        </div>

        <form action={signIn}>
          <ul className="obs-list">
            {SIGN_IN_OPTIONS.map((option) => (
              <Card as="li" key={option.key}>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-4)",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "16rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <strong>{option.viewer.displayName}</strong>
                      <Badge tone="accent">{option.viewer.role.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="obs-muted" style={{ margin: "var(--space-1) 0 0" }}>
                      {option.viewer.organisationName} — {option.blurb}
                    </p>
                  </div>
                  <button
                    className="obs-action"
                    data-emphasis="primary"
                    name="viewer"
                    value={option.key}
                    type="submit"
                  >
                    Continue
                  </button>
                </div>
              </Card>
            ))}
          </ul>
        </form>
      </div>
    </main>
  );
}
