"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OrbState } from "../orb/profile";
import type { ObserverContext } from "./types";

/**
 * Observer, out loud.
 *
 * WebRTC directly from the browser to OpenAI, using an ephemeral client secret
 * that a protected server endpoint mints for this session. **The API key is
 * never here.** If this file could reach it, the entire security posture of the
 * feature would be decorative, so a test asserts that no client module can.
 *
 * ## What the browser is, and is not
 *
 * It is a **courier**. The realtime model asks for a tool; the browser relays
 * the name and arguments to `/api/observer/voice/tool`, which checks the name
 * against the compile-time allowlist, validates the arguments and runs the
 * analysis under the viewer's own grants. The browser holds no read models and
 * decides nothing. A model talked into requesting something outside the
 * registry gets a refusal from the server, not from a check in this file that
 * an attacker can read.
 *
 * ## The microphone
 *
 * Requested on an explicit user action and never before. `connect()` is only
 * ever called from a click, and nothing in this module runs `getUserMedia` on
 * mount, on hover, or on a route change.
 */

export type VoicePhase =
  | "unavailable"
  | "idle"
  | "requesting_microphone"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export interface VoiceBlocker {
  readonly kind: string;
  readonly detail: string;
}

export interface ObserverVoice {
  readonly phase: VoicePhase;
  /** Non-secret, operator-facing. Rendered where an operator can see it. */
  readonly blocker: VoiceBlocker | null;
  /** What was said, so the text interface can carry the same conversation. */
  readonly transcript: readonly { readonly who: "you" | "observer"; readonly text: string }[];
  readonly orbState: OrbState;
  /**
   * Live frequency data from the session, 0–1 per band, or null when no session
   * is running. Real audio measured off the streams — never a simulated shape.
   */
  readonly frequencies: Float32Array | null;
  readonly supported: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const PHASE_TO_ORB: Readonly<Record<VoicePhase, OrbState>> = {
  unavailable: "idle",
  idle: "idle",
  requesting_microphone: "attention",
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  error: "error",
};

export function useObserverVoice(context: ObserverContext): ObserverVoice {
  const [phase, setPhase] = useState<VoicePhase>("unavailable");
  const [blocker, setBlocker] = useState<VoiceBlocker | null>(null);
  const [transcript, setTranscript] = useState<
    readonly { who: "you" | "observer"; text: string }[]
  >([]);

  const connection = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  /*
   * Loudness, for whatever is drawing Observer.
   *
   * Measured, never invented: both the microphone already open for this session
   * and the model's own reply feed one analyser, so the orb answers your voice
   * and its voice the same way. No second stream is requested — this taps what
   * the session is carrying anyway, which is the only reason it is allowed to
   * exist beside the rule at the top of this file.
   *
   * The array identity is stable and its contents are rewritten in place. A
   * frequency band per frame through React state would rerender the tree sixty
   * times a second to move a pixel inside a canvas.
   */
  const meter = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const pump = useRef(0);
  const [bands, setBands] = useState<Float32Array | null>(null);

  /*
   * WebRTC is not universal, and neither is a microphone.
   *
   * Checked rather than assumed, because the failure without a check is a
   * button that throws on click in exactly the browsers least likely to be
   * reported.
   */
  const supported =
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    navigator.mediaDevices !== undefined;

  /* Ask the server whether voice can work at all, before rendering a control. */
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/observer/voice/session", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { available?: boolean; blocker?: VoiceBlocker | null } | null) => {
        if (cancelled || body === null) return;
        if (body.available === true && supported) setPhase("idle");
        else setBlocker(body.blocker ?? { kind: "unsupported", detail: "This browser cannot." });
      })
      .catch(() => {
        /* Voice simply stays unavailable. The text interface is untouched. */
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const disconnect = useCallback(() => {
    channel.current?.close();
    channel.current = null;
    connection.current?.close();
    connection.current = null;
    // Stopping every track is what actually turns the microphone light off.
    // Closing the peer connection alone leaves it on, which is alarming and
    // correctly so.
    microphone.current?.getTracks().forEach((track) => track.stop());
    microphone.current = null;
    audio.current?.remove();
    audio.current = null;
    cancelAnimationFrame(pump.current);
    pump.current = 0;
    analyser.current = null;
    void meter.current?.close().catch(() => {
      /* Already closed, or never opened. Nothing depends on the outcome. */
    });
    meter.current = null;
    setBands(null);
    setPhase((current) => (current === "unavailable" ? current : "idle"));
  }, []);

  useEffect(() => disconnect, [disconnect]);

  /** Relays one tool call to the server and returns what to tell the model. */
  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>): Promise<string> => {
      const response = await fetch("/api/observer/voice/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: name,
          args,
          question: typeof args["question"] === "string" ? args["question"] : null,
          tenantSlug: context.tenantSlug,
          projectSlug: context.projectSlug,
          period: context.period,
          unitCode: context.unitCode,
          meetingId: context.meetingId,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      return JSON.stringify(body ?? { error: "The analysis could not be run." });
    },
    [context.meetingId, context.period, context.projectSlug, context.tenantSlug, context.unitCode],
  );

  const connect = useCallback(async () => {
    if (!supported || connection.current !== null) return;

    try {
      /* 1. the credential — minted server-side, short-lived, not the API key */
      setPhase("connecting");
      const minted = await fetch("/api/observer/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "voice session",
          tenantSlug: context.tenantSlug,
          projectSlug: context.projectSlug,
          period: context.period,
          unitCode: context.unitCode,
          meetingId: context.meetingId,
        }),
      });

      if (!minted.ok) {
        const body = (await minted.json().catch(() => null)) as {
          blocker?: VoiceBlocker;
        } | null;
        setBlocker(
          body?.blocker ?? { kind: "unavailable", detail: "The voice session could not start." },
        );
        setPhase("error");
        return;
      }

      const session = (await minted.json()) as { clientSecret: string; model: string };

      /* 2. the microphone — only now, and only because somebody clicked */
      setPhase("requesting_microphone");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone.current = stream;

      /* 3. the peer connection */
      setPhase("connecting");
      const peer = new RTCPeerConnection();
      connection.current = peer;

      const element = document.createElement("audio");
      element.autoplay = true;
      audio.current = element;

      /*
       * One analyser, both directions.
       *
       * Tapping the streams rather than the <audio> element on purpose: routing
       * an element through Web Audio makes the page responsible for playing it
       * again, and a mistake there is silence during a conversation. A stream
       * source only listens.
       */
      let listener: AnalyserNode | null = null;
      try {
        const ac = new AudioContext();
        const an = ac.createAnalyser();
        an.fftSize = 128;
        an.smoothingTimeConstant = 0.6;
        ac.createMediaStreamSource(stream).connect(an);
        meter.current = ac;
        analyser.current = an;
        listener = an;

        const raw = new Uint8Array(an.frequencyBinCount);
        const level = new Float32Array(an.frequencyBinCount);
        setBands(level);
        const tick = () => {
          an.getByteFrequencyData(raw);
          for (let i = 0; i < raw.length; i++) level[i] = (raw[i] ?? 0) / 255;
          pump.current = requestAnimationFrame(tick);
        };
        pump.current = requestAnimationFrame(tick);
      } catch {
        /* No meter. The session still works; the orb simply runs on state. */
      }

      peer.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote === undefined) return;
        element.srcObject = remote;
        if (listener === null || meter.current === null) return;
        try {
          meter.current.createMediaStreamSource(remote).connect(listener);
        } catch {
          /* The reply just will not register on the meter. */
        }
      };

      for (const track of stream.getTracks()) peer.addTrack(track, stream);

      const data = peer.createDataChannel("oai-events");
      channel.current = data;

      data.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = String(message["type"] ?? "");

        if (type === "input_audio_buffer.speech_started") setPhase("listening");
        else if (type === "input_audio_buffer.speech_stopped") setPhase("thinking");
        else if (type === "response.output_audio.delta") setPhase("speaking");
        else if (type === "response.done") setPhase("listening");

        /* What was heard, and what was said. Kept so the text panel matches. */
        if (type === "conversation.item.input_audio_transcription.completed") {
          const text = String(message["transcript"] ?? "").trim();
          if (text.length > 0) setTranscript((t) => [...t, { who: "you", text }]);
        }
        if (type === "response.output_audio_transcript.done") {
          const text = String(message["transcript"] ?? "").trim();
          if (text.length > 0) setTranscript((t) => [...t, { who: "observer", text }]);
        }

        /*
         * A tool call. Relayed, never executed here.
         *
         * The result goes back as a conversation item and the model is asked to
         * continue, which is the realtime equivalent of returning from a
         * function — the model then speaks the figures it was handed rather
         * than the ones it might have guessed.
         */
        if (type === "response.function_call_arguments.done") {
          const name = String(message["name"] ?? "");
          const callId = String(message["call_id"] ?? "");
          let args: Record<string, unknown> = {};
          try {
            const decoded: unknown = JSON.parse(String(message["arguments"] ?? "{}"));
            if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
              args = decoded as Record<string, unknown>;
            }
          } catch {
            /* Malformed arguments reach the server and are refused there. */
          }

          setPhase("thinking");
          void runTool(name, args).then((output) => {
            data.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: { type: "function_call_output", call_id: callId, output },
              }),
            );
            data.send(JSON.stringify({ type: "response.create" }));
          });
        }
      };

      /* 4. the SDP exchange, authenticated with the ephemeral secret */
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const answer = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(session.model)}`,
        {
          method: "POST",
          body: offer.sdp ?? "",
          headers: {
            Authorization: `Bearer ${session.clientSecret}`,
            "Content-Type": "application/sdp",
          },
        },
      );

      if (!answer.ok) {
        setBlocker({
          kind: "realtime_unreachable",
          // A status code is not a secret and is the single most useful thing
          // an operator can be told here.
          detail: `The realtime endpoint answered ${answer.status}. Check that this account can reach ${session.model}.`,
        });
        setPhase("error");
        disconnect();
        return;
      }

      await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      setPhase("listening");
    } catch (error) {
      /*
       * A refused microphone is a decision, not a fault.
       *
       * Treating it as an error would put a red state on screen because
       * somebody declined, which is both wrong and slightly rude.
       */
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setBlocker({
          kind: "microphone_denied",
          detail: "The microphone permission was declined. Observer still answers in text.",
        });
        setPhase("idle");
      } else {
        setBlocker({ kind: "failed", detail: "The voice connection could not be established." });
        setPhase("error");
      }
      disconnect();
    }
  }, [
    context.meetingId,
    context.period,
    context.projectSlug,
    context.tenantSlug,
    context.unitCode,
    disconnect,
    runTool,
    supported,
  ]);

  return {
    phase,
    blocker,
    transcript,
    orbState: PHASE_TO_ORB[phase],
    frequencies: bands,
    supported,
    connect,
    disconnect,
  };
}
