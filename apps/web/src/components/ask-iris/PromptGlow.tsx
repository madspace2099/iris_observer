"use client";

import { useEffect, useRef } from "react";

import { attachPromptGlow } from "./prompt-glow";

/**
 * MOUNTS THE TRAVELLING GLOW ON THE COMPOSER IT IS PLACED INSIDE.
 *
 * The canvas is created imperatively by `attachPromptGlow` rather than rendered
 * here, which is the handoff's own arrangement and the reason the animation
 * never touches React: a frame is a uniform write and a draw call, so a 60Hz
 * lap costs zero renders and zero reconciliation.
 *
 * ## Why it finds its card instead of being handed one
 *
 * The composers are server components — `AskScreen` and `AskDock` both render
 * their form on the server — so there is no ref to pass down. Rather than turn
 * either into a client component to obtain one, this renders an empty marker,
 * reads its parent as the host, and takes the card from `[data-glow-card]`
 * within it. The cost is one hidden span; the saving is that the whole composer
 * stays server-rendered.
 *
 * ## It renders nothing on the server, and that is deliberate
 *
 * Before hydration there is no canvas, and `ask-iris.css` keys the still CSS
 * halo on the canvas being ABSENT. So the first paint carries the static glow,
 * the canvas replaces it on mount, and a reader whose browser refuses WebGL
 * keeps it. There is no frame in which the card is unlit.
 */
export function PromptGlow({ intensity }: { readonly intensity?: number }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = marker.current?.parentElement;
    const card = host?.querySelector<HTMLElement>("[data-glow-card]");
    if (!card) return;

    const glow = attachPromptGlow({ card, ...(intensity === undefined ? {} : { intensity }) });
    return () => glow.destroy();
  }, [intensity]);

  return <span ref={marker} hidden aria-hidden="true" data-glow-mount="" />;
}
