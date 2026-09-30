/**
 * PREFLIGHT STEP 1, RUNNABLE (CONF1, 2026-09-30).
 *
 * `preflight.ts` holds the whole decision table for "does this environment's
 * SUPABASE_URL point at the approved project", and nothing ran it: it was read
 * and executed by eye. This feeds one real value into that table and prints the
 * table's own answer. It decides nothing itself — the state, the verdict and
 * the remedy are the table's, word for word.
 *
 *     pnpm preflight:step1 <server-origin> [<public-origin> | absent] [--manual]
 *     pnpm preflight:step1                  (reads SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL)
 *
 * With arguments, the first is the SUPABASE_URL value exactly as copied — not
 * trimmed, because whitespace in the variable is itself a fault the table
 * names. The second is what was observed about NEXT_PUBLIC_SUPABASE_URL: its
 * exact value, or the word `absent` for a row looked for and not there. Left
 * out, the public variable was not looked at, and the table answers PAUSE,
 * because MAPPED needs that observation.
 *
 * `--manual` is for a value a person READ in a dashboard (CONF2). The table
 * treats that as a different route — `confirmManualMapping` — because a reader
 * can shorten what they see: a bare project ref names the project and proves
 * nothing about the shape of what is configured, and only the manual route
 * says so (MANUAL_ORIGIN_SHAPE_UNPROVEN). Without the flag the value is taken
 * as read by a program, which is the tooling route.
 *
 * With no arguments and no flag, it reads the two variables from this
 * process's environment; one that is not set there is observed absent.
 *
 * The project URL is not a secret (`apps/web/src/lib/supabase-env.ts`), so the
 * values are printed. Nothing here reads any other variable.
 */
import {
  APPROVED_PROJECT_REF,
  PROJECT_MAPPING_STATES,
  PUBLIC_ABSENT,
  PUBLIC_UNOBSERVED,
  classifyProjectMapping,
  confirmManualMapping,
  publicPresent,
  type MappingOutcome,
  type PublicObservation,
  type Via,
} from "./preflight";

export interface Step1Result {
  /** Which of the table's two routes classified the value. */
  readonly via: Via;
  readonly serverUrl: string | undefined;
  readonly observedPublic: PublicObservation;
  readonly outcome: MappingOutcome;
  readonly remedy: string;
}

const MANUAL = "--manual";

function publicFromArgument(argument: string | undefined): PublicObservation {
  if (argument === undefined) return PUBLIC_UNOBSERVED;
  return argument === "absent" ? PUBLIC_ABSENT : publicPresent(argument);
}

export function step1(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Step1Result {
  const via: Via = argv.includes(MANUAL) ? "manual" : "tooling";
  const args = argv.filter((a) => a !== MANUAL);
  /* A manual observation is what somebody typed in; the process environment is not one. */
  const fromEnvironment = args.length === 0 && via === "tooling";
  const serverUrl = fromEnvironment ? env.SUPABASE_URL : args[0];
  const observedPublic = fromEnvironment
    ? env.NEXT_PUBLIC_SUPABASE_URL === undefined
      ? PUBLIC_ABSENT
      : publicPresent(env.NEXT_PUBLIC_SUPABASE_URL)
    : publicFromArgument(args[1]);

  const outcome =
    via === "manual"
      ? confirmManualMapping({
          observedServer: serverUrl,
          observedPublic,
          approvedRef: APPROVED_PROJECT_REF,
        })
      : classifyProjectMapping({ serverUrl, observedPublic, approvedRef: APPROVED_PROJECT_REF });
  const state = PROJECT_MAPPING_STATES.find((s) => s.name === outcome.state);
  if (state === undefined) throw new Error(`the table has no state ${outcome.state}`);
  return { via, serverUrl, observedPublic, outcome, remedy: state.remedy };
}

export function render({ via, serverUrl, observedPublic, outcome, remedy }: Step1Result): string {
  const observed =
    observedPublic.kind === "present" ? JSON.stringify(observedPublic.value) : observedPublic.kind;
  return [
    `SUPABASE_URL:             ${serverUrl === undefined ? "(not set)" : JSON.stringify(serverUrl)}`,
    `NEXT_PUBLIC_SUPABASE_URL: ${observed}`,
    `approved project ref:     ${APPROVED_PROJECT_REF}`,
    "",
    `via:     ${via}`,
    `state:   ${outcome.state}`,
    `verdict: ${outcome.verdict}`,
    ...(outcome.ref === null ? [] : [`ref:     ${outcome.ref}`]),
    `remedy:  ${remedy}`,
  ].join("\n");
}

/** PASS 0, STOP 1, PAUSE 2. */
const EXIT = { PASS: 0, STOP: 1, PAUSE: 2 } as const;

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/release/preflight-step1.ts")) {
  const result = step1(process.argv.slice(2), process.env);
  console.log(render(result));
  process.exitCode = EXIT[result.outcome.verdict];
}
