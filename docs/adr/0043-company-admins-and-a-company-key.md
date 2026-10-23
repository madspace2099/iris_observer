# ADR-0043 — Company admins, and a company's key on a local demonstration

**Status:** accepted · **Date:** 2026-10-19
**Amends:** ADR-0030 (keys belong to accounts) for one more local case; ADR-0040 (the demonstration
key) with a positive local signal
**Keeps:** ADR-0022 (the sign-in selects a scenario, it does not authenticate), ADR-0024 and ADR-0033
(the screen names what wrote the words), Gate 1 (the notice at the prompt box)

## Context

The owner asked for two things for the recorded demonstration: "within a company there should be
roles", and when the company's admin "has not added e.g. an OpenAI API key yet, show a popup after
sign-in asking for the API key". ADR-0030 gives every key to an account and keeps it sealed in
Supabase; the local recording machine has no Supabase, so no account there can hold a key, and
ADR-0040's environment key belongs to nobody in the story the recording tells.

A review of ADR-0040 also found it fails open: the key is honoured wherever no deployment marker is
present, which is a list of what a deployment looks like rather than a sign that this is the owner's
machine.

## Decision

1. **A company is the capacity's organisation** (`Viewer.organisationName`). Every directory account
   carries `companyRole: "admin" | "member"`, and every company has exactly one admin
   (`accounts.test.ts`): Petra (Alpha Estates), Tomáš (Meridian Sales), MADSPACE Operations, Clara
   Weiss (Shark Developments), Daniel Hart (Shark Sales). Monika, Martin and Akhilesh are Meridian
   members; Nora Lind is a fictional member of Shark Developments on Clara's capacity, so a recording
   can show a member's view. `companyOf(account)` names the company, the role and the admin. A
   company role is not a product role (`ROLES`); it decides only who manages the company's key.
2. **The company key store** (`lib/credentials/company-keys.ts`) holds one OpenAI key per company in
   process memory on `globalThis` (a server action saves it and the stream route spends it; they are
   separate module registries). It is open only when `OBSERVER_DEMO_COMPANY_KEYS` is exactly `1` and
   ADR-0040's local-demonstration conditions hold (`localDemonstration()`). Only the admin sets or
   removes the key; it is trimmed, at least twelve characters, and probed once (`probeFor`): a key
   that works, or works but cannot reach the model, is kept; any other failure keeps nothing and is
   said in the existing failure vocabulary. What a screen reads (`companyKeyState`) carries the last
   four, who set it and when, never the key. It is lost on restart, by design.
3. **The loopback host, for both keys.** `/api/ask/stream` spends the company key, then the
   environment key, only when the request's own `Host` header is `localhost`, `127.0.0.1` or `[::1]`
   (any port), in addition to the conditions above. The account is the gate's, from the signed
   session, never the body's. Like ADR-0040, neither key consults the account's admission or budget
   ledger; the gate, ceilings, tool allowlist, guards and audit row are unchanged. The Ask composer
   names the model, and gives the Gate 1 notice, only where the route would spend a key: AI on, a
   loopback request, a key present (`composerNotices`, unit-tested). The notice covers typed
   questions and the live openings, which go to the same route; so do the dialog and the Settings
   panel (`MODEL_WORDED`).
4. **The popup.** After sign-in, `/welcome` shows the company's admin a dialog over the held welcome
   sequence when the store is open, the company has no key, and this request could spend one
   (`demoKeysSpendable`: AI on, a loopback `Host`); a key asked for anywhere else would be probed,
   paid for and never used. The dialog says what the key is for and where it lives, gives the Gate 1
   sentence, an uncontrolled password field, Save key (disabled and saying so while the key is
   checked) and Skip for now (a link to the validated destination; Escape does the same).
   `?key=skip` plays the welcome without asking. Where no model answers at the Ask composer, members
   and admins who skipped see one line saying the company has no key, or that its key is spent only
   on localhost with the language model on. `/settings/ai` carries the company key panel: on a
   spendable request the admin connects, replaces and removes it; elsewhere it reports the key and
   says where it is spent; a member sees who manages it.
5. **Where it is on.** `scripts/demo-start.mjs` sets `OBSERVER_DEMO_COMPANY_KEYS=1`. The browser
   suite blanks it (`playwright.config.ts`), so no admin's sign-in there meets the dialog.

## Consequences

- The recording can show an admin connecting the company once and a member asking with it, on the
  production build, with no Supabase.
- A server reached by any name other than the loopback spends neither demonstration key, even with
  every other condition met. A client can forge `Host`, so this is a second local signal beside the
  deployment markers, not a security boundary on its own.
- The key is plaintext in process memory. The upgrade, when a company can own a row in the
  credential store, is to seal it with `envelope.ts` and delete this module in one piece;
  `credentials.test.ts` names it among the few product files allowed on `globalThis`, beside
  `ai/limits.ts` and `sources/local-db.ts`, with this reason.
- `Nora Lind` shares Clara's capacity, so she shares its user id: the Ask ceiling bucket and the
  audit subject are Clara's. She shares its static tenants and projects only: grants made in
  MADSPACE administration follow the account id, so a project granted to Clara there is not Nora's.
  An account of her own is the fix when that matters.

## Amendment, 2026-10-23: the reader picks the model, and OpenAI is asked through Responses

The first real key exposed three things. Each is now settled:

- **The model is the reader's choice.** Where a demonstration key answers (this ADR, or ADR-0040's
  owner key), the Ask composer's model menu lists the catalogue's models as buttons. The choice is
  the `observer_ask_model` cookie on that browser (`lib/ai/model-choice.ts`), set by
  `chooseAskModel` for a signed-in account and only to a catalogue id. The page names the model from
  it, and the stream route spends the key on it through `demoGrant`, so the two cannot disagree. A
  key configured with a model outside the catalogue keeps that model as the first option, which
  clears the choice. An account's own connection keeps its Settings preferences and never reads the
  cookie.
- **OpenAI is asked through the Responses API.** The GPT-5.6 family answers 400 on chat completions
  to any request that carries function tools and a reasoning effort together, which is every
  planning and composition turn. `providers/transport.ts` now posts `buildBody`'s request to
  `/v1/responses` (transport `openai-responses`, catalogue `2026-10-23.1`). The key test, which
  carries no tools, had passed throughout.
- **A failure says why, in the log only.** A failed connection test logs its status and the vendor's
  short code, or for no answer the error's name and system code. A failed turn's message carries the
  status, the code, and the name of the field the vendor objected to. None of them carries the key or
  the vendor's sentence. The demo launcher trusts the operating system's certificates
  (`NODE_USE_SYSTEM_CA=1`), because an HTTPS-inspecting antivirus re-signs api.openai.com with a
  root that only the Windows store holds.
