"use client";

import { useState } from "react";

/**
 * Copy an identifier.
 *
 * The identifier is on screen either way — this only saves an operator from
 * selecting thirty-six characters by hand before pasting them into a support
 * thread. That is why the failure path shows the value rather than an error:
 * `navigator.clipboard` is unavailable over plain HTTP and refused when the
 * document is not focused, and in both cases the useful thing to say is "select
 * it yourself", not "copy failed".
 *
 * The confirmation is announced politely rather than asserted, so a screen
 * reader finishes the current phrase before hearing it.
 */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [said, setSaid] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setSaid("Copied");
    } catch {
      setSaid("Copy unavailable — select the identifier to copy it");
    }
  }

  return (
    <>
      <button className="mad-copy" type="button" onClick={() => void copy()} aria-label={label}>
        Copy
      </button>
      <span className="mad-copy-said" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}
