"use client";

import { createContext, useContext } from "react";

import type { ObserverContext } from "./types";
import { useObserverVoice, type ObserverVoice } from "./useObserverVoice";
import { useUrlObserverContext } from "./useUrlContext";

/**
 * One voice session for the whole project, held by the shell.
 *
 * It used to live inside the console, which meant it existed only on the
 * briefing. Everywhere else the rail drew Observer with no idea whether a
 * conversation was happening, so the presence sat still while somebody was
 * talking to it — and navigating away mid-sentence tore the session down.
 *
 * Lifting it here says the true thing: Observer is chrome, not a page. The
 * session survives navigation, and both bodies — the console at full size and
 * the rail collapsed — read the same conversation.
 *
 * ## The microphone rule is unchanged
 *
 * Mounting a provider is not connecting. Nothing here calls `connect`; the
 * session still starts from an explicit click and from nowhere else, which is
 * the rule `useObserverVoice` records and depends on. What moved is where the
 * session is kept, not what opens it.
 *
 * The hook reads only tenant, project, period, unit and meeting off the
 * context, and every one of those is in the URL — so deriving the context here
 * gives the session exactly what it was given before.
 */
const VoiceContext = createContext<ObserverVoice | null>(null);

export function ObserverVoiceProvider({
  root,
  role,
  projectLabel,
  children,
}: {
  readonly root: string;
  readonly role: ObserverContext["role"];
  readonly projectLabel: string;
  readonly children: React.ReactNode;
}) {
  const context = useUrlObserverContext({ root, role, projectLabel });
  const voice = useObserverVoice(context);
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>;
}

/**
 * A session that cannot happen, for surfaces rendered outside the shell.
 *
 * An inert object rather than null or a thrown error: a surface without a
 * provider should draw Observer without a voice, not fail to render and not
 * force every reader of this hook through a null check. `unavailable` is
 * already the phase the UI knows how to draw.
 */
const NO_VOICE: ObserverVoice = {
  phase: "unavailable",
  blocker: null,
  transcript: [],
  orbState: "idle",
  frequencies: null,
  supported: false,
  connect: () => Promise.resolve(),
  disconnect: () => {},
};

/** The shared session. Never null; see NO_VOICE. */
export function useSharedVoice(): ObserverVoice {
  return useContext(VoiceContext) ?? NO_VOICE;
}
