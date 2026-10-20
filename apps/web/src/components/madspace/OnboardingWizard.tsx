"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ENVIRONMENT_CHOICES } from "@/components/madspace/CreateSourceForm";
import { StatusChip } from "@/components/madspace/StatusMark";
import { onboardAction } from "@/lib/madspace/create-actions";
import { localeFits, slugFrom, timeZoneFits } from "@/lib/madspace/slug";
import { activationClaimedAction } from "@/lib/madspace/source-actions";

/**
 * CLIENT & ENGINE ONBOARDING, AS AKHILESH DESIGNED IT (ADR-0044).
 *
 * His modal from the AD panel (`_review/ad-panel`), ported onto this surface's
 * dark tokens and onto the real control plane: four steps, one press. Steps 1.1
 * to 1.3 collect a client, a project and a machine; "Generate activation code"
 * sends all of it to `onboardAction`, which writes nothing until every field
 * and both peppers pass, and step 1.4 shows the code that comes back.
 *
 * What was deliberately not ported: the Supabase insert from the browser, the
 * `localStorage` list of recent codes in plaintext, the `ACT-XXXX-XXXX` code
 * shape, and the gradients. The code is the real `obs.<selector>.<secret>`,
 * held in ONE place, `issued` below, and dropped by "Onboard another client".
 *
 * ACTIVATED is what the poll can see: a credential minted at or after the code
 * was issued. Observer keeps CONNECTED for a heartbeat, so this screen never
 * says the engine is connected.
 */

type Step = 1 | 2 | 3 | 4;

type Issued = Extract<Awaited<ReturnType<typeof onboardAction>>, { ok: true }>;

interface Problem {
  readonly step: Step;
  /** The control the sentence belongs to, or null for the step as a whole. */
  readonly field: string | null;
  readonly text: string;
}

const STEPS: readonly { readonly step: Step; readonly title: string; readonly sub: string }[] = [
  { step: 1, title: "Client", sub: "Client ID" },
  { step: 2, title: "Project", sub: "Name & Domain" },
  { step: 3, title: "Source", sub: "Main PC" },
  { step: 4, title: "Activation", sub: "Copy code" },
];

/** Akhilesh's quick names for the machine that runs Unreal Engine. */
const SOURCE_PILLS = ["Main PC", "Kiosk 1", "Showroom VR", "Display Booth"] as const;

/** The countdown turns to a warning at three minutes, as his did. */
const WARNING_SECONDS = 180;
const CLAIM_POLL_MS = 4_000;
const COPIED_MS = 3_000;

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function knownLocale(value: string): boolean {
  if (!localeFits(value)) return false;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([value]).length === 1;
  } catch {
    return false;
  }
}

function knownTimeZone(value: string): boolean {
  if (!timeZoneFits(value)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function OnboardingWizard({
  developers,
  currencies,
  reservedClientIds,
  demonstrationClientIds,
  clientIdPattern,
  domainPattern,
}: {
  /** Clients the control plane already holds, offered as one-press choices. */
  readonly developers: readonly { readonly name: string; readonly slug: string }[];
  /** What the server's `isCurrency` accepts, so the two never disagree. */
  readonly currencies: readonly string[];
  readonly reservedClientIds: readonly string[];
  readonly demonstrationClientIds: readonly string[];
  /** `TENANT_SLUG.source` and `PROJECT_SLUG.source`, passed rather than copied. */
  readonly clientIdPattern: string;
  readonly domainPattern: string;
}) {
  const base = useId();
  const id = (name: string) => `${base}-${name}`;

  const [step, setStep] = useState<Step>(1);
  const [client, setClient] = useState("");
  const [projectName, setProjectName] = useState("");
  const [domain, setDomain] = useState("");
  const [domainTouched, setDomainTouched] = useState(false);
  const [currency, setCurrency] = useState("");
  const [locale, setLocale] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [environment, setEnvironment] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  const [issued, setIssued] = useState<Issued | null>(null);
  const [activated, setActivated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [said, setSaid] = useState("");
  const [origin, setOrigin] = useState("");

  const panel = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  /*
   * The browser's own locale and time zone, VISIBLY: written into the two
   * fields after hydration, where the operator can read and change them. The
   * server cannot know either, and guessing them there would render one value
   * and hydrate another.
   */
  useEffect(() => {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    /* The base name: a browser's -u- extensions are not a shape the project keeps. */
    const own = new Intl.Locale(resolved.locale).baseName;
    setLocale((typed) => (typed === "" ? own : typed));
    setTimeZone((typed) => (typed === "" ? resolved.timeZone : typed));
    setOrigin(window.location.origin);
  }, []);

  /* Focus follows the step, as in his wizard, but never on the first render. */
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    panel.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, [step]);

  const expiresAt = issued === null ? Number.NaN : Date.parse(issued.expiresAt);
  const remaining = Number.isFinite(expiresAt)
    ? Math.max(0, Math.round((expiresAt - now) / 1000))
    : 0;
  const live = issued !== null && !activated && remaining > 0;

  /* The countdown's clock: one tick a second while the code can still be used. */
  useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  /* His four-second claim poll, against the credential the exchange mints. */
  const sourceId = issued?.sourceId ?? null;
  const issuedAt = issued?.issuedAt ?? null;
  useEffect(() => {
    if (!live || sourceId === null || issuedAt === null) return undefined;
    const timer = window.setInterval(() => {
      void activationClaimedAction(sourceId, issuedAt).then((answer) => {
        if (answer.ok && answer.activated) setActivated(true);
      });
    }, CLAIM_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, sourceId, issuedAt]);

  /*
   * One last read when the clock reaches zero. The tick that ends the countdown
   * also ends the poll, and a throttled background tab can let a minute pass
   * between polls, so a code used in that gap would otherwise read Expired.
   */
  const expired = issued !== null && !activated && remaining === 0;
  useEffect(() => {
    if (!expired || sourceId === null || issuedAt === null) return;
    void activationClaimedAction(sourceId, issuedAt).then((answer) => {
      if (answer.ok && answer.activated) setActivated(true);
    });
  }, [expired, sourceId, issuedAt]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => {
      setCopied(false);
      setSaid("");
    }, COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  /* --- validation, step by step --- */

  function refuse(at: Step, field: string | null, text: string): false {
    setProblem({ step: at, field, text });
    if (field !== null) document.getElementById(id(field))?.focus();
    return false;
  }

  function clientPasses(): boolean {
    if (client === "") return refuse(1, "client", "Give the client an ID before continuing.");
    if (!new RegExp(clientIdPattern).test(client)) {
      return refuse(
        1,
        "client",
        "A client ID is lowercase letters, digits and hyphens, and starts and ends with a letter or a digit.",
      );
    }
    if (reservedClientIds.includes(client)) {
      return refuse(
        1,
        "client",
        "That client ID is an address this application uses itself. Choose another.",
      );
    }
    if (demonstrationClientIds.includes(client)) {
      return refuse(
        1,
        "client",
        "A demonstration developer already lives at that client ID. Choose another.",
      );
    }
    return true;
  }

  function projectPasses(): boolean {
    if (projectName.trim() === "") return refuse(2, "project", "Give the project a name.");
    if (!new RegExp(domainPattern).test(domain)) {
      return refuse(
        2,
        "domain",
        "A domain is lowercase letters, digits and hyphens, and starts and ends with a letter or a digit.",
      );
    }
    if (currency === "") {
      return refuse(2, "currency", "Choose the currency the project's prices are in.");
    }
    if (!knownLocale(locale)) {
      return refuse(2, "locale", "That is not a locale. Use a form such as sk-SK.");
    }
    if (!knownTimeZone(timeZone)) {
      return refuse(
        2,
        "timezone",
        "That is not a time zone. Use a form such as Europe/Bratislava.",
      );
    }
    return true;
  }

  function sourcePasses(): boolean {
    if (sourceLabel.trim() === "") return refuse(3, "source", "Give the machine a source name.");
    if (environment === "") {
      return refuse(
        3,
        "environment",
        "Choose the environment this machine runs in. It cannot be changed from the installation afterwards.",
      );
    }
    return true;
  }

  function go(next: Step) {
    setProblem(null);
    setStep(next);
  }

  /* Steps 1.1 and 1.2 passed on their own Next, and only completed steps reopen. */
  function generate() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    onboardAction({
      client,
      projectName,
      projectSlug: domain,
      currency,
      locale,
      timeZone,
      sourceLabel,
      environment,
    })
      .then((answer) => {
        if (!answer.ok) {
          setStep(answer.step);
          setProblem({ step: answer.step, field: null, text: answer.problem });
          return;
        }
        setIssued(answer);
        setActivated(false);
        setNow(Date.now());
        setStep(4);
      })
      .catch(() => {
        setProblem({
          step: 3,
          field: null,
          text: "The server's answer did not arrive, so this page cannot say what was registered. Check Projects before trying again.",
        });
      })
      .finally(() => setBusy(false));
  }

  function next() {
    if (step === 1 && clientPasses()) go(2);
    else if (step === 2 && projectPasses()) go(3);
    else if (step === 3 && sourcePasses()) generate();
    else if (step === 4) restart();
  }

  /** THE DROP POINT: after this the plaintext is in neither state nor the document. */
  function restart() {
    setIssued(null);
    setActivated(false);
    setCopied(false);
    setSaid("");
    setClient("");
    setProjectName("");
    setDomain("");
    setDomainTouched(false);
    setCurrency("");
    setSourceLabel("");
    setEnvironment("");
    go(1);
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setSaid("Activation code copied to the clipboard.");
    } catch {
      setSaid("The clipboard is unavailable here. Select the code above and copy it.");
    }
  }

  /* --- small pieces the panels share --- */

  const shown = problem !== null && problem.step === step ? problem : null;
  const errorId = id("problem");
  const invalid = (field: string) =>
    shown?.field === field ? { "aria-invalid": true, "aria-describedby": errorId } : {};

  const nextLabel =
    step === 1
      ? "Next: Project →"
      : step === 2
        ? "Next: Source →"
        : step === 3
          ? busy
            ? "Generating…"
            : "Generate activation code"
          : "+ Onboard another client";

  const chosenEnvironment = ENVIRONMENT_CHOICES.find((choice) => choice.value === environment);

  return (
    <section className="mad-wizard" aria-labelledby={id("title")}>
      <header className="mad-wizard-head">
        <div>
          <h1 className="mad-wizard-title" id={id("title")}>
            Client &amp; Engine Onboarding
          </h1>
          <p className="mad-wizard-sub">
            Generate a 15-minute activation code to connect Unreal Engine to Observer.
          </p>
        </div>
        <a className="mad-wizard-close" href="/madspace/projects" aria-label="Close onboarding">
          ×
        </a>
      </header>

      <ol className="mad-wizard-steps">
        {STEPS.map((item) => {
          const state = item.step === step ? "active" : item.step < step ? "done" : "todo";
          /* Completed steps open again, until a code exists: then they are history. */
          const reopen = state === "done" && step < 4;
          const body = (
            <>
              <span className="mad-wizard-num">1.{item.step}</span>
              <span className="mad-wizard-meta">
                <span className="mad-wizard-step-title">{item.title}</span>
                <span className="mad-wizard-step-sub">{item.sub}</span>
              </span>
            </>
          );
          return (
            <li
              key={item.step}
              className="mad-wizard-step"
              data-state={state}
              aria-current={state === "active" ? "step" : undefined}
            >
              {reopen ? (
                <button type="button" onClick={() => go(item.step)}>
                  {body}
                </button>
              ) : (
                <span>{body}</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mad-wizard-body" ref={panel}>
        {step === 1 ? (
          <div className="mad-wizard-panel">
            <div className="mad-wizard-intro">
              <h2>Step 1.1: Add client</h2>
              <p>
                The developer this project belongs to. Pick one already registered, or give a new
                client an ID.
              </p>
            </div>
            <div className="mad-field">
              <label className="mad-field-label" htmlFor={id("client")}>
                Client ID{" "}
                <span className="mad-wizard-required" aria-hidden="true">
                  *
                </span>
              </label>
              <div className="mad-wizard-inline">
                <input
                  className="mad-input mad-wizard-mono"
                  id={id("client")}
                  required
                  type="text"
                  value={client}
                  placeholder="e.g. client-001"
                  maxLength={64}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setClient(event.target.value.toLowerCase())}
                  {...invalid("client")}
                />
                <button
                  className="mad-action"
                  type="button"
                  onClick={() => {
                    /* Never the ID of a client already registered: the press would reuse it. */
                    const taken = new Set(developers.map((developer) => developer.slug));
                    const free = Array.from({ length: 900 }, (_, n) => `client-${n + 100}`).filter(
                      (candidate) => !taken.has(candidate),
                    );
                    setClient(free[Math.floor(Math.random() * free.length)] ?? "");
                  }}
                >
                  Generate ID
                </button>
              </div>
              <p className="mad-field-hint">
                The client&rsquo;s address. Every project of this client opens under /
                {client === "" ? "client-id" : client}/.
              </p>
              {developers.length === 0 ? null : (
                <div className="mad-wizard-pills" role="group" aria-label="Registered clients">
                  {developers.map((developer) => (
                    <button
                      key={developer.slug}
                      type="button"
                      className="mad-wizard-pill"
                      aria-pressed={client === developer.slug}
                      onClick={() => setClient(developer.slug)}
                    >
                      {developer.name === developer.slug
                        ? developer.slug
                        : `${developer.name} /${developer.slug}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mad-wizard-panel">
            <div className="mad-wizard-intro">
              <h2>Step 1.2: Add project</h2>
              <p>The development&rsquo;s name, its address, and how its figures are written.</p>
            </div>
            <div className="mad-field">
              <label className="mad-field-label" htmlFor={id("project")}>
                Project name{" "}
                <span className="mad-wizard-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="mad-input"
                id={id("project")}
                required
                type="text"
                value={projectName}
                placeholder="e.g. Linden Court"
                maxLength={200}
                autoComplete="off"
                onChange={(event) => {
                  setProjectName(event.target.value);
                  if (!domainTouched) setDomain(slugFrom(event.target.value) ?? "");
                }}
                {...invalid("project")}
              />
            </div>
            <div className="mad-field">
              <label className="mad-field-label" htmlFor={id("domain")}>
                Domain{" "}
                <span className="mad-wizard-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="mad-input mad-wizard-mono"
                id={id("domain")}
                required
                type="text"
                value={domain}
                placeholder="linden-court"
                maxLength={120}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setDomainTouched(true);
                  setDomain(event.target.value.toLowerCase());
                }}
                {...invalid("domain")}
              />
              <p className="mad-field-hint">
                The project&rsquo;s address, /{client}/{domain === "" ? "domain" : domain}. Filled
                in from the name. It is fixed once the project is created.
              </p>
            </div>
            <div className="mad-wizard-row">
              <div className="mad-field">
                <label className="mad-field-label" htmlFor={id("currency")}>
                  Currency{" "}
                  <span className="mad-wizard-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <select
                  className="mad-input"
                  id={id("currency")}
                  required
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  {...invalid("currency")}
                >
                  <option value="">Choose</option>
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mad-field">
                <label className="mad-field-label" htmlFor={id("locale")}>
                  Locale{" "}
                  <span className="mad-wizard-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  className="mad-input mad-wizard-mono"
                  id={id("locale")}
                  required
                  type="text"
                  value={locale}
                  placeholder="sk-SK"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setLocale(event.target.value.trim())}
                  {...invalid("locale")}
                />
              </div>
              <div className="mad-field">
                <label className="mad-field-label" htmlFor={id("timezone")}>
                  Time zone{" "}
                  <span className="mad-wizard-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  className="mad-input mad-wizard-mono"
                  id={id("timezone")}
                  required
                  type="text"
                  value={timeZone}
                  placeholder="Europe/Bratislava"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setTimeZone(event.target.value.trim())}
                  {...invalid("timezone")}
                />
              </div>
            </div>
            <p className="mad-field-hint">
              Locale and time zone are taken from this browser. Change them if the development is
              somewhere else.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mad-wizard-panel">
            <div className="mad-wizard-intro">
              <h2>Step 1.3: Add source</h2>
              <p>Identify which workstation, PC or kiosk will run Unreal Engine.</p>
            </div>
            <div className="mad-field">
              <label className="mad-field-label" htmlFor={id("source")}>
                Source name{" "}
                <span className="mad-wizard-required" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                className="mad-input"
                id={id("source")}
                required
                type="text"
                value={sourceLabel}
                placeholder="e.g. Main PC, Kiosk 1"
                maxLength={200}
                autoComplete="off"
                onChange={(event) => setSourceLabel(event.target.value)}
                {...invalid("source")}
              />
              <div className="mad-wizard-pills" role="group" aria-label="Quick names">
                {SOURCE_PILLS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="mad-wizard-pill"
                    aria-pressed={sourceLabel === name}
                    onClick={() => setSourceLabel(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <fieldset className="mad-fieldset">
              <legend className="mad-field-label">
                Environment{" "}
                <span className="mad-wizard-required" aria-hidden="true">
                  *
                </span>
              </legend>
              <p className="mad-field-hint">
                Authoritative for every event this machine sends. A build that reports another one
                is recorded as a mismatch, not believed.
              </p>
              <div className="mad-wizard-pills">
                {ENVIRONMENT_CHOICES.map((choice) => (
                  <label key={choice.value} className="mad-wizard-pill" data-radio="">
                    <input
                      type="radio"
                      required
                      name={id("environment")}
                      id={
                        choice.value === ENVIRONMENT_CHOICES[0].value
                          ? id("environment")
                          : undefined
                      }
                      value={choice.value}
                      checked={environment === choice.value}
                      onChange={() => setEnvironment(choice.value)}
                      {...invalid("environment")}
                    />
                    {choice.name}
                  </label>
                ))}
              </div>
              {chosenEnvironment === undefined ? null : (
                <p className="mad-field-hint">{chosenEnvironment.detail}</p>
              )}
            </fieldset>
          </div>
        ) : null}

        {step === 4 && issued !== null ? (
          <div className="mad-wizard-panel">
            <div className="mad-wizard-intro">
              <h2>Step 1.4: Activation code</h2>
              <p>Shown once, never stored in readable form, and valid for 15 minutes.</p>
            </div>

            <div className="mad-wizard-code">
              <div className="mad-wizard-code-head">
                <span className="mad-wizard-code-label">Unreal Engine activation code</span>
                <span
                  className="mad-wizard-countdown"
                  data-state={
                    activated
                      ? "good"
                      : remaining === 0
                        ? "expired"
                        : remaining <= WARNING_SECONDS
                          ? "warning"
                          : "good"
                  }
                >
                  {activated
                    ? "Code used"
                    : remaining === 0
                      ? "Expired"
                      : remaining <= WARNING_SECONDS
                        ? `Expires soon, ${clock(remaining)} remaining`
                        : `${clock(remaining)} remaining`}
                </span>
              </div>

              <div className="mad-wizard-code-row">
                <code className="mad-activation-code">{issued.code}</code>
                <button
                  className="mad-action"
                  type="button"
                  data-weight={live ? "primary" : undefined}
                  disabled={!live}
                  onClick={() => void copy(issued.code)}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <span className="mad-copy-said" role="status" aria-live="polite">
                {said}
              </span>

              <p className="mad-wizard-status" role="status">
                {activated ? (
                  <StatusChip tone="good">Activated</StatusChip>
                ) : remaining === 0 ? (
                  <StatusChip tone="wrong">Expired</StatusChip>
                ) : (
                  <StatusChip tone="await">Active, waiting for the engine</StatusChip>
                )}
              </p>

              <dl className="mad-activation-meta">
                <div>
                  <dt>Client</dt>
                  <dd className="mad-wizard-mono">{issued.tenantSlug}</dd>
                </div>
                <div>
                  <dt>Project</dt>
                  <dd>{projectName}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd className="mad-wizard-mono">
                    /{issued.tenantSlug}/{issued.projectSlug}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{sourceLabel}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{chosenEnvironment?.name ?? environment}</dd>
                </div>
              </dl>
            </div>

            <div className="mad-wizard-hint">
              <strong>Next in Unreal Engine (Step 2.1)</strong>
              <p>
                Paste the code into the IRIS Observer plugin in Unreal Engine. It presents it to{" "}
                <span className="mad-wizard-mono">{origin}/functions/v1/observer-activate</span>.
                Leaving this page drops the code; another is issued from the source&rsquo;s page.
              </p>
              <p className="mad-wizard-links">
                <a className="mad-quiet" href={`/madspace/sources/${issued.sourceId}`}>
                  Open the source
                </a>
                <a className="mad-quiet" href={`/${issued.tenantSlug}/${issued.projectSlug}`}>
                  Open the project&rsquo;s dashboard
                </a>
              </p>
            </div>
          </div>
        ) : null}

        {shown === null ? null : (
          <p className="mad-form-problem" id={errorId} role="alert">
            {shown.text}
          </p>
        )}
      </div>

      <footer className="mad-wizard-foot">
        {step === 2 || step === 3 ? (
          <button className="mad-button" type="button" onClick={() => go((step - 1) as Step)}>
            {"← Back"}
          </button>
        ) : null}
        <button
          className="mad-button"
          type="button"
          data-emphasis="primary"
          aria-disabled={busy}
          onClick={next}
        >
          {nextLabel}
        </button>
      </footer>
    </section>
  );
}
