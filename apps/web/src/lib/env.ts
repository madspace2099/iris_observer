import "server-only";
import { z } from "zod";

/**
 * The environment, validated once.
 *
 * Two rules govern this file.
 *
 * **It never returns a secret.** Callers ask whether something is configured,
 * not what it is. The one exception is the module that actually makes the
 * request — the model provider reads the key directly — and a test asserts
 * that nothing which reads a key can be a client component.
 *
 * **It never stops the application from building.** Observer runs on the
 * deterministic synthetic repository. Supabase is staging infrastructure for
 * later milestones, so a missing Supabase variable is a logged warning while
 * `OBSERVER_DATA_SOURCE` is `synthetic`, and an error the moment it is not.
 * A build that fails because a database nobody reads is unconfigured would be a
 * false alarm; a runtime that silently reads an empty database would be worse.
 *
 * Model *identifiers* are configuration, not secrets, and are validated here
 * beside everything else (ADR-0026). The key is not: it never appears in the
 * report this module returns.
 */

/**
 * Reasoning effort, as the Responses API spells it.
 *
 * `medium` is the product default. `high` is reserved for deep reports and
 * complex comparisons and is requested per call, never set globally — a
 * deployment that quietly runs every answer at `high` is a deployment whose
 * bill is a surprise.
 */
export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * A model identifier, checked for shape rather than for membership.
 *
 * Deliberately not an enum. Model names change faster than deployments do, and
 * an enum here would mean a code change to adopt a successor. What must not
 * happen is a *silent* substitution, and that is prevented elsewhere: the
 * allowlist in `ai/limits.ts` decides which identifiers this deployment will
 * actually call, and an unavailable model raises a configuration error rather
 * than falling through to a different one.
 */
const ModelId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/, "must be a bare model identifier");

/** `false` only when spelled exactly. Anything else is treated as true. */
const BooleanFlag = (fallback: boolean) =>
  z
    .enum(["true", "false"])
    .default(fallback ? "true" : "false")
    .transform((v) => v === "true");

const Schema = z.object({
  /**
   * Where read models come from.
   *
   * `synthetic` is the deterministic in-process repository. `supabase` does not
   * exist yet and is rejected here rather than half-implemented — pointing a
   * finished interface at an empty database is not a migration.
   */
  OBSERVER_DATA_SOURCE: z.enum(["synthetic"]).default("synthetic"),

  /** Which deployment this is. Staging shows a banner and refuses indexing. */
  OBSERVER_ENVIRONMENT: z.enum(["development", "staging", "production"]).default("development"),

  /** Browser-safe. Protected by row-level security, not by obscurity. */
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),

  /** Server-only. Never NEXT_PUBLIC_, never logged, never returned from here. */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),

  /**
   * The only secret this file knows the *name* of.
   *
   * Validated for presence so a misconfigured deployment says so at startup,
   * and then never carried into the report below.
   */
  OPENAI_API_KEY: z.string().min(1).optional(),

  /* --- the model configuration (ADR-0026) --------------------------------- */

  /** Primary intelligence. Analysis, comparison, every reader-facing answer. */
  OPENAI_TEXT_MODEL: ModelId.default("gpt-5.6-sol"),
  /** Background work only, and only where a wrong answer is cheap to correct. */
  OPENAI_FAST_MODEL: ModelId.default("gpt-5.6-luna"),
  /** The realtime voice model. Never reached from the browser directly. */
  OPENAI_VOICE_MODEL: ModelId.default("gpt-realtime-2.1"),
  OPENAI_REASONING_EFFORT: z.enum(REASONING_EFFORTS).default("medium"),
  /**
   * Vendor-side retention.
   *
   * Present as a variable so the posture is auditable in a deployment's own
   * configuration, and pinned to `false` by the provider regardless — see
   * `ai/provider.ts`. Setting it to `true` here changes nothing, which is the
   * intended outcome of somebody trying.
   */
  OPENAI_STORE_RESPONSES: BooleanFlag(false),

  /** Whether Ask Observer calls a model at all. */
  OBSERVER_AI_ENABLED: BooleanFlag(true),
  /** Whether the realtime voice layer is offered. */
  OBSERVER_VOICE_ENABLED: BooleanFlag(true),
});

export type ObserverEnvironment = z.infer<typeof Schema>;

/**
 * What is configured, without saying what any of it is.
 *
 * This is the shape surfaces and diagnostics may read. Every field is a
 * boolean, an enum or a model identifier; there is no path from here to a key.
 */
export interface EnvironmentReport {
  readonly dataSource: "synthetic";
  readonly environment: "development" | "staging" | "production";
  readonly supabase: {
    readonly browserConfigured: boolean;
    readonly serverConfigured: boolean;
  };
  readonly ai: {
    /** The feature switch, before any question of whether a key exists. */
    readonly enabled: boolean;
    /** Whether a key is present. Never which key, never how long. */
    readonly keyConfigured: boolean;
    /**
     * Whether the key is even the right *shape*.
     *
     * A key that is present but malformed produces a 401 on every call, and a
     * 401 is indistinguishable at the surface from a revoked key or an empty
     * account: Ask Observer quietly falls back to evidence-only prose and the
     * operator has no way to tell why. This one boolean is the difference
     * between "the model is unavailable" and "the variable was set wrongly",
     * and it is derivable from the shape without reading the secret.
     */
    readonly keyWellFormed: boolean;
    /** Model ids are configuration and may be shown to an operator. */
    readonly textModel: string;
    readonly fastModel: string;
    readonly voiceModel: string;
    readonly reasoningEffort: ReasoningEffort;
    readonly storeResponses: boolean;
    readonly voiceEnabled: boolean;
  };
  /** Problems worth a server log. Never contains a value. */
  readonly problems: readonly string[];
}

let cached: EnvironmentReport | null = null;

/**
 * Validates each variable on its own.
 *
 * The whole object used to be parsed in one call, and one rejected value threw
 * every other value away: `const env = parsed.success ? parsed.data :
 * Schema.parse({})`. A single mistyped `SUPABASE_URL` would therefore leave a
 * correctly configured `OPENAI_API_KEY` reported as absent — and the two
 * failures look identical from outside, so the operator goes and checks the
 * wrong variable.
 *
 * One bad value now disables exactly itself, says so by name, and every other
 * variable keeps working.
 *
 * **The validator's own message is deliberately not repeated.** Zod echoes what
 * it received for an enum mismatch, and this function reads variables that must
 * never be echoed anywhere. The variable's name is enough: the schema that
 * rejected it is thirty lines above this comment.
 */
function validateIndependently(source: NodeJS.ProcessEnv): {
  readonly env: ObserverEnvironment;
  readonly problems: readonly string[];
} {
  const problems: string[] = [];
  const values: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(Schema.shape)) {
    const schema = field as z.ZodType;
    const result = schema.safeParse(source[name]);
    if (result.success) {
      values[name] = result.data;
      continue;
    }

    problems.push(
      `${name} is set to a value this deployment cannot use, so it is being ignored and the default applies. Nothing else is affected.`,
    );
    // Whatever the variable would have been had it been left unset.
    const fallback = schema.safeParse(undefined);
    if (fallback.success) values[name] = fallback.data;
  }

  return { env: values as ObserverEnvironment, problems };
}

export function environment(): EnvironmentReport {
  if (cached !== null) return cached;

  const { env, problems: fieldProblems } = validateIndependently(process.env);
  const problems: string[] = [...fieldProblems];

  const browserConfigured =
    env.NEXT_PUBLIC_SUPABASE_URL !== undefined &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== undefined;
  const serverConfigured = env.SUPABASE_URL !== undefined && env.SUPABASE_SECRET_KEY !== undefined;

  if (env.OBSERVER_ENVIRONMENT !== "development" && !browserConfigured) {
    problems.push(
      "Supabase browser variables are not set. Harmless while OBSERVER_DATA_SOURCE is synthetic; required before any milestone reads the database.",
    );
  }
  if (env.OBSERVER_ENVIRONMENT !== "development" && !serverConfigured) {
    problems.push(
      "Supabase server variables are not set. Harmless while OBSERVER_DATA_SOURCE is synthetic; required before any milestone reads the database.",
    );
  }

  const keyConfigured = env.OPENAI_API_KEY !== undefined;
  /*
   * Shape, not value.
   *
   * An OpenAI key is `sk-` followed by URL-safe characters and nothing else.
   * The failures worth catching here are the ones a person makes at a keyboard:
   * pasting the placeholder brackets around the value, leaving quotes on, or
   * letting a line break in. Every one of them yields a 401 that reads exactly
   * like a revoked key.
   */
  const keyWellFormed =
    env.OPENAI_API_KEY !== undefined && /^sk-[A-Za-z0-9_-]+$/.test(env.OPENAI_API_KEY);
  if (keyConfigured && !keyWellFormed) {
    problems.push(
      "OPENAI_API_KEY is set but is not shaped like an OpenAI key — check for placeholder angle brackets, surrounding quotes or a stray line break. Every model call will be rejected until it is corrected.",
    );
  }
  if (env.OBSERVER_AI_ENABLED && !keyConfigured) {
    problems.push(
      "OBSERVER_AI_ENABLED is on but OPENAI_API_KEY is not set. Ask Observer answers from the deterministic provider: the same tools and the same evidence, in plainer prose.",
    );
  }
  if (env.OPENAI_STORE_RESPONSES) {
    /*
     * Said out loud rather than honoured.
     *
     * The provider pins `store: false`. A deployment that has asked for
     * retention deserves to be told its request was ignored, instead of
     * discovering the posture by reading source.
     */
    problems.push(
      "OPENAI_STORE_RESPONSES is true. It is ignored: Observer pins store=false on every request (ADR-0026).",
    );
  }
  if (env.OBSERVER_VOICE_ENABLED && !keyConfigured) {
    problems.push(
      "OBSERVER_VOICE_ENABLED is on but no key is configured, so the voice layer stays disabled and says so.",
    );
  }

  cached = {
    dataSource: env.OBSERVER_DATA_SOURCE,
    environment: env.OBSERVER_ENVIRONMENT,
    supabase: { browserConfigured, serverConfigured },
    ai: {
      enabled: env.OBSERVER_AI_ENABLED,
      keyConfigured,
      keyWellFormed,
      textModel: env.OPENAI_TEXT_MODEL,
      fastModel: env.OPENAI_FAST_MODEL,
      voiceModel: env.OPENAI_VOICE_MODEL,
      reasoningEffort: env.OPENAI_REASONING_EFFORT,
      storeResponses: env.OPENAI_STORE_RESPONSES,
      voiceEnabled: env.OBSERVER_VOICE_ENABLED,
    },
    problems,
  };

  return cached;
}

/**
 * Logs the posture once, at startup.
 *
 * Actionable rather than decorative: it names what is missing and what that
 * costs. It cannot print a value, because it is handed a report that has none.
 */
export function reportEnvironment(): void {
  const report = environment();
  const lines = [
    `[observer] data source: ${report.dataSource} · environment: ${report.environment}`,
    `[observer] supabase: browser ${report.supabase.browserConfigured ? "configured" : "not configured"}, server ${report.supabase.serverConfigured ? "configured" : "not configured"}`,
    `[observer] ai: ${report.ai.enabled ? "enabled" : "disabled"} · key ${report.ai.keyConfigured ? (report.ai.keyWellFormed ? "present" : "present but malformed") : "absent"} · text ${report.ai.textModel} · fast ${report.ai.fastModel} · effort ${report.ai.reasoningEffort}`,
    `[observer] voice: ${report.ai.voiceEnabled ? "offered" : "disabled"} · model ${report.ai.voiceModel}`,
    ...report.problems.map((p) => `[observer] ${p}`),
  ];
  for (const line of lines) console.info(line);
}

/** True when the deployment must not be indexed or mistaken for production. */
export function isStaging(): boolean {
  return environment().environment !== "production";
}

/** Test seam. The report is cached for the process; tests need it rebuilt. */
export function resetEnvironmentCache(): void {
  cached = null;
}
