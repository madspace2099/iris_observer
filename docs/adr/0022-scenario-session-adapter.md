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
