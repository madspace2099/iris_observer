/**
 * PREFLIGHT STEP 1, RUNNABLE (CONF1, 2026-09-30).
 *
 * `preflight.ts` holds the whole decision table for "does this environment's
 * SUPABASE_URL point at the approved project", and nothing ran it: it was read
 * and executed by eye. This feeds one real value into that table and prints the
 * table's own answer. It decides nothing itself — the state, the verdict and
 * the remedy are the table's, word for word.
 *
 *     pnpm preflight:step1 <server-origin> [<public-origin> | absent]
 *     pnpm preflight:step1                  (reads SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL)
 *
 * With arguments, the first is the SUPABASE_URL value exactly as copied — not
 * trimmed, because whitespace in the variable is itself a fault the table
 * names. The second is what was observed about NEXT_PUBLIC_SUPABASE_URL: its
 * exact value, or the word `absent` for a row looked for and not there. Left
 * out, the public variable was not looked at, and the table answers PAUSE,
 * because MAPPED needs that observation.
 *
 * With no arguments, it reads the two variables from this process's
 * environment; one that is not set there is observed absent.
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
  publicPresent,
  type MappingInput,
  type MappingOutcome,
  type PublicObservation,
} from "./preflight";

export interface Step1Result {
  readonly input: MappingInput;
  readonly outcome: MappingOutcome;
  readonly remedy: string;
}

function publicFromArgument(argument: string | undefined): PublicObservation {
  if (argument === undefined) return PUBLIC_UNOBSERVED;
  return argument === "absent" ? PUBLIC_ABSENT : publicPresent(argument);
}

export function step1(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Step1Result {
  const input: MappingInput =
    args.length > 0
      ? {
          serverUrl: args[0],
          observedPublic: publicFromArgument(args[1]),
          approvedRef: APPROVED_PROJECT_REF,
        }
      : {
          serverUrl: env.SUPABASE_URL,
          observedPublic:
            env.NEXT_PUBLIC_SUPABASE_URL === undefined
              ? PUBLIC_ABSENT
              : publicPresent(env.NEXT_PUBLIC_SUPABASE_URL),
          approvedRef: APPROVED_PROJECT_REF,
        };
  const outcome = classifyProjectMapping(input);
  const state = PROJECT_MAPPING_STATES.find((s) => s.name === outcome.state);
  if (state === undefined) throw new Error(`the table has no state ${outcome.state}`);
  return { input, outcome, remedy: state.remedy };
}

export function render({ input, outcome, remedy }: Step1Result): string {
  const observed =
    input.observedPublic.kind === "present"
      ? JSON.stringify(input.observedPublic.value)
      : input.observedPublic.kind;
  return [
    `SUPABASE_URL:             ${input.serverUrl === undefined ? "(not set)" : JSON.stringify(input.serverUrl)}`,
    `NEXT_PUBLIC_SUPABASE_URL: ${observed}`,
    `approved project ref:     ${input.approvedRef}`,
    "",
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
