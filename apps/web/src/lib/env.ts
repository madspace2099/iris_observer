import "server-only";
import { z } from "zod";

/**
 * The environment, validated once.
 *
 * Two rules govern this file.
 *
 * **It never returns a secret.** Callers ask whether something is configured,
 * not what it is. The one exception is the module that actually makes the
 * request — the model provider reads `FAL_KEY` directly — and a test asserts
 * that nothing which reads a key can be a client component.
 *
 * **It never stops the application from building.** Observer runs on the
 * deterministic synthetic repository. Supabase is staging infrastructure for
 * later milestones, so a missing Supabase variable is a logged warning while
 * `OBSERVER_DATA_SOURCE` is `synthetic`, and an error the moment it is not.
 * A build that fails because a database nobody reads is unconfigured would be a
 * false alarm; a runtime that silently reads an empty database would be worse.
 */

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

  FAL_KEY: z.string().min(1).optional(),
  OBSERVER_LLM_PROVIDER: z.enum(["fal-openrouter", "deterministic"]).default("fal-openrouter"),
  OBSERVER_LLM_MODEL: z.string().min(1).optional(),
});

export type ObserverEnvironment = z.infer<typeof Schema>;

/**
 * What is configured, without saying what any of it is.
 *
 * This is the shape surfaces and diagnostics may read. Every field is a
 * boolean or an enum; there is no path from here to a key.
 */
export interface EnvironmentReport {
  readonly dataSource: "synthetic";
  readonly environment: "development" | "staging" | "production";
  readonly supabase: {
    readonly browserConfigured: boolean;
    readonly serverConfigured: boolean;
  };
  readonly model: {
    readonly provider: "fal-openrouter" | "deterministic";
    readonly configured: boolean;
    /** The model id is configuration, not a secret, so it may be shown. */
    readonly model: string | null;
  };
  /** Problems worth a server log. Never contains a value. */
  readonly problems: readonly string[];
}

let cached: EnvironmentReport | null = null;

export function environment(): EnvironmentReport {
  if (cached !== null) return cached;

  const parsed = Schema.safeParse(process.env);
  const problems: string[] = [];

  if (!parsed.success) {
    // Report the variable names, never the values that failed.
    for (const issue of parsed.error.issues) {
      problems.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const env = parsed.success ? parsed.data : Schema.parse({});

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
  if (env.OBSERVER_LLM_PROVIDER === "fal-openrouter" && env.FAL_KEY === undefined) {
    problems.push(
      "FAL_KEY is not set, so Ask Observer answers from the deterministic provider. The same tools and the same evidence, in plainer prose.",
    );
  }

  cached = {
    dataSource: env.OBSERVER_DATA_SOURCE,
    environment: env.OBSERVER_ENVIRONMENT,
    supabase: { browserConfigured, serverConfigured },
    model: {
      provider: env.OBSERVER_LLM_PROVIDER,
      configured: env.FAL_KEY !== undefined,
      model: env.OBSERVER_LLM_MODEL ?? null,
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
    `[observer] model: ${report.model.provider}${report.model.configured ? "" : " (no key — deterministic answers)"}`,
    ...report.problems.map((p) => `[observer] ${p}`),
  ];
  for (const line of lines) console.info(line);
}

/** True when the deployment must not be indexed or mistaken for production. */
export function isStaging(): boolean {
  return environment().environment !== "production";
}
