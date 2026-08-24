# ADR-0022 — The session adapter is a scenario selector, not authentication

**Status:** accepted · 2026-08-24

## Context

M2 shipped a sign-in screen that stored the chosen role in a cookie. Anybody could become a MADSPACE
administrator by editing one string in devtools.

For synthetic data that is not a breach. It is worse in a subtler way: a reviewer clicking through
four roles would have been reviewing an access model that does not exist, and the product would have
carried a habit into the milestone where the data is real.

## Decision

The adapter stays — production authentication is a later milestone — but it holds one real property:
**the browser cannot grant itself a tenant or a role.**

- Sign-in mints an opaque, server-issued identifier. The cookie carries nothing else.
- The server keeps the session table. An identifier it did not issue resolves to nothing, including a
  well-formed guess and a value that used to be valid.
- Sign-out destroys the server record, not only the cookie, so a copied cookie stops working.
- The cookie is `HttpOnly` and `SameSite=Lax`, `Secure` in production, and expires.
- Every tenant, project and role check happens server-side, in the repository, on every call.

**It is called a scenario selector in the interface**, because describing it as authentication would
invite somebody to rely on it.

## Consequences

- The access model a reviewer exercises is the one that will ship.
- The session table is in memory: it does not survive a restart and does not span instances. Both are
  deliberate — a durable store here would be the start of an authentication system nobody reviewed.
- Replacing this means replacing one file. Nothing above it changes.

---

## Amendment, 2026-08-24 — the session is a signed token, not a table

The first implementation kept session records in a `Map` on the server. On one
process that works and gives real revocation. On Vercel it does not work at all:
every request may land on a different lambda instance, so the session minted by
the sign-in action was invisible to the next page load and to `/api/ask`. The
symptom the user saw was Ask Observer answering _"could not reach its analysis
layer"_ — a 401 in a coat.

The session is now a stateless token: `viewerKey.expiresAt.nonce.hmac`, signed
with HMAC-SHA256 and compared in constant time.

**Kept.** The browser cannot grant itself a role. The key is readable but signed,
so editing it invalidates the token. A test asserts it.

**Given up.** Server-side revocation. Sign-out clears the cookie and the token
expires after eight hours, but a copy taken beforehand stays valid until then.

That trade is acceptable _only_ because of what the token grants: a profile from
a screen where all four profiles are already freely selectable, over data that is
entirely synthetic. It would not be acceptable for authentication, and
authentication will not be built on it — `docs/11-preproduction-gates.md` gates
production on a real identity provider with revocable sessions.

**The signing secret.** `OBSERVER_SESSION_SECRET` when set. Otherwise derived
from the deployment id, which is not secret — stated plainly rather than hidden,
because a forged token buys nothing that the sign-in screen does not already give
away.
