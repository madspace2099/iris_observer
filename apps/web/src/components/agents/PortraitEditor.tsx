"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AgentPortrait } from "./Portrait";

/**
 * CHOOSE AN IMAGE, SEE IT, SAVE IT (ADR-0054).
 *
 * The company admin's control on an agent's page, and the agent's own on
 * theirs. Small and calm: one button until there is something to decide, a
 * preview before anything is sent, a removal that asks once. The server decides
 * everything that matters — the right, the format by its first bytes, the size,
 * the metadata — and what it refuses is printed here as it said it.
 *
 * Where this server keeps no portraits (a hosted deployment), the control is a
 * sentence and the initials, never a button that cannot work.
 */

type State =
  | { readonly kind: "idle"; readonly message: string | null; readonly tone: "saved" | null }
  | { readonly kind: "chosen"; readonly file: File; readonly preview: string }
  | { readonly kind: "busy"; readonly preview: string | null; readonly doing: string }
  | { readonly kind: "confirm" }
  | { readonly kind: "refused"; readonly reason: string; readonly preview: string | null };

const IDLE: State = { kind: "idle", message: null, tone: null };

export function PortraitEditor({
  endpoint,
  name,
  src,
  tone,
  mode,
  available,
  unavailable,
  maxBytes,
}: {
  /** The route that takes PUT and DELETE for this agent. */
  readonly endpoint: string;
  readonly name: string;
  readonly src: string | null;
  readonly tone?: string | undefined;
  /** The company admin's control, or the agent's own. */
  readonly mode: "company_admin" | "self";
  /** Whether this server keeps portraits at all. */
  readonly available: boolean;
  /** What to say where it does not. */
  readonly unavailable: string;
  readonly maxBytes: number;
}) {
  const router = useRouter();
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>(IDLE);

  const preview = "preview" in state ? state.preview : null;
  useEffect(() => {
    if (preview === null) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);
  useEffect(() => {
    if (state.kind === "confirm") confirmButton.current?.focus();
  }, [state.kind]);

  const title = mode === "self" ? "Your portrait" : "Portrait";

  if (!available) {
    return (
      <section className="ag-editor" aria-labelledby={titleId}>
        <h2 className="ag-editor-title" id={titleId}>
          {title}
        </h2>
        <div className="ag-editor-body">
          <AgentPortrait name={name} src={null} tone={tone} size="editor" alt="" />
          <p className="ag-editor-note">{unavailable}</p>
        </div>
      </section>
    );
  }

  const send = async (method: "PUT" | "DELETE", body: File | null, doing: string) => {
    setState({ kind: "busy", preview: state.kind === "chosen" ? state.preview : null, doing });
    try {
      const response = await fetch(endpoint, {
        method,
        body,
        headers: body === null ? {} : { "Content-Type": "application/octet-stream" },
        credentials: "same-origin",
      });
      const answer = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      const message = answer?.message ?? "The server did not answer in a way this page can read.";
      if (!response.ok || answer?.ok !== true) {
        setState({ kind: "refused", reason: message, preview: null });
        return;
      }
      setState({ kind: "idle", message, tone: "saved" });
      router.refresh();
    } catch {
      setState({
        kind: "refused",
        reason: "The server could not be reached. Nothing was changed.",
        preview: null,
      });
    }
  };

  const choose = (file: File | undefined) => {
    if (input.current !== null) input.current.value = "";
    if (file === undefined) return;
    if (file.size > maxBytes) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setState({
        kind: "refused",
        reason: `That file is ${mb} MB; a portrait can be at most ${maxBytes / (1024 * 1024)} MB.`,
        preview: null,
      });
      return;
    }
    setState({ kind: "chosen", file, preview: URL.createObjectURL(file) });
  };

  const shown = preview ?? src;
  const busy = state.kind === "busy";
  const note =
    mode === "self"
      ? "Your company's admin added this. You can replace it or remove it."
      : src === null
        ? `PNG, JPEG or WebP, up to ${maxBytes / (1024 * 1024)} MB. Location and camera details are removed before it is kept.`
        : `Shown beside ${name} wherever they appear in Observer.`;

  return (
    <section className="ag-editor" aria-labelledby={titleId}>
      <h2 className="ag-editor-title" id={titleId}>
        {title}
      </h2>
      <div className="ag-editor-body">
        <AgentPortrait
          name={name}
          src={shown}
          tone={tone}
          size="editor"
          alt={preview === null ? name : `The new portrait for ${name}, not saved yet`}
        />
        <div className="ag-editor-side">
          <p className="ag-editor-note">{note}</p>

          {state.kind === "confirm" ? (
            <>
              <p className="ag-editor-note">
                Remove {name}&rsquo;s portrait? Their initials show instead.
              </p>
              <div className="ox-btn-row">
                <button
                  ref={confirmButton}
                  type="button"
                  className="ox-btn"
                  onClick={() => void send("DELETE", null, "Removing…")}
                >
                  Remove portrait
                </button>
                <button
                  type="button"
                  className="ox-btn"
                  data-weight="quiet"
                  onClick={() => setState(IDLE)}
                >
                  Keep it
                </button>
              </div>
            </>
          ) : state.kind === "chosen" || (busy && preview !== null) ? (
            <div className="ox-btn-row">
              <button
                type="button"
                className="ox-btn"
                data-weight="primary"
                disabled={busy}
                onClick={() => {
                  if (state.kind === "chosen") void send("PUT", state.file, "Saving…");
                }}
              >
                Save portrait
              </button>
              <button
                type="button"
                className="ox-btn"
                data-weight="quiet"
                disabled={busy}
                onClick={() => setState(IDLE)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="ox-btn-row">
              <button
                type="button"
                className="ox-btn"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {src === null ? "Choose image" : "Replace"}
              </button>
              {src === null ? null : (
                <button
                  type="button"
                  className="ox-btn"
                  data-weight="quiet"
                  disabled={busy}
                  onClick={() => setState({ kind: "confirm" })}
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <p
            className="ag-editor-status"
            role="status"
            data-tone={
              state.kind === "refused" ? "refused" : state.kind === "idle" ? state.tone : undefined
            }
          >
            {state.kind === "busy"
              ? state.doing
              : state.kind === "refused"
                ? state.reason
                : state.kind === "idle"
                  ? state.message
                  : null}
          </p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => choose(event.target.files?.[0])}
      />
    </section>
  );
}
