import type { ObserverContext } from "./types";

/**
 * What Observer offers to answer next.
 *
 * Written from what is on screen, not from a fixed list. With an agent selected
 * the offers are about that agent; with a unit selected they are about that
 * unit; and neither makes the reader retype a name the interface already knows.
 *
 * Pure, so the mapping from context to offers is a unit test rather than
 * something discovered by clicking around.
 */

const PROJECT_LEVEL = [
  "What changed this month?",
  "Compare the sales agents",
  "Show unusual presentation flows",
  "Which units are losing attention?",
] as const;

/**
 * What a sales agent is offered instead.
 *
 * Their own patterns, their own preparation, and the team only in aggregate —
 * never a colleague by name. The product promises them no league table, and an
 * offer is a promise about what the next screen will contain.
 */
const AGENT_LEVEL = [
  "What changed in my meetings this month?",
  "How do my presentations differ from the team average?",
  "Which units are losing attention?",
  "What should I prepare for my next meeting?",
] as const;

export function suggestionsFor(context: ObserverContext): readonly string[] {
  if (context.meetingId !== null) {
    return [
      "Walk me through this meeting",
      "Where did this presentation slow down?",
      "What was shortlisted, and when?",
      "How does this compare with a typical meeting?",
    ];
  }

  if (context.unitCode !== null) {
    const unit = context.unitCode;
    return [
      `Why is ${unit} getting attention?`,
      `Who looked at ${unit} and did not shortlist it?`,
      `What is usually opened just before ${unit}?`,
      `Is ${unit} losing or gaining interest?`,
    ];
  }

  if (context.agentName !== null) {
    const first = context.agentName.split(" ")[0] ?? context.agentName;
    return [
      `How does ${first} present differently from the team?`,
      `What happens in ${first}'s longest meetings?`,
      `Which sections does ${first} skip?`,
      `Compare ${first} with the strongest progression rate`,
    ];
  }

  if (context.segment !== null) {
    const segment = context.segment.replace(/-/g, " ");
    return [
      `What is interesting about ${segment} units?`,
      `Who is looking at ${segment} and not buying?`,
      `What did buyers search for that we do not have?`,
      "Which places do these buyers spend longest on?",
    ];
  }

  return context.role === "sales_agent" ? AGENT_LEVEL : PROJECT_LEVEL;
}

/**
 * The greeting.
 *
 * Computed on the server and passed down, because a greeting derived from the
 * clock during hydration is a mismatch between two renders of the same page.
 */
export function greetingFor(hour: number, name: string): string {
  const first = name.split(" ")[0] ?? name;
  if (hour < 5) return `Still up, ${first}.`;
  if (hour < 12) return `Good morning, ${first}.`;
  if (hour < 18) return `Good afternoon, ${first}.`;
  return `Good evening, ${first}.`;
}
