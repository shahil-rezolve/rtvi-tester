/** Subscribes to every wrapper event and feeds the session store (log, turns, levels, interim transcript). */
import { useEffect } from "react";
import { RTVIEvent, useRTVI, type PipecatMetricsData, type TranscriptData } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { toInspectable } from "@/lib/inspectable";
import { sessionStore } from "@/store/sessionStore";

const SPEECH = new Set<string>([RTVIEvent.UserStartedSpeaking, RTVIEvent.UserStoppedSpeaking, RTVIEvent.BotStartedSpeaking, RTVIEvent.BotStoppedSpeaking]);

export function record(name: string, args: unknown[]): void {
  const s = sessionStore.getState();
  const t = Date.now();

  if (name === RTVIEvent.LocalAudioLevel) return s.setLevel("local", Number(args[0]) || 0);
  if (name === RTVIEvent.RemoteAudioLevel) return s.setLevel("remote", Number(args[0]) || 0);

  if (SPEECH.has(name)) s.applyTurn({ type: name as "userStartedSpeaking", t });
  else if (name === RTVIEvent.UserTranscript) {
    const d = args[0] as TranscriptData;
    s.setInterim(d.final ? "" : d.text);
    s.applyTurn({ type: "userTranscript", t, text: d.text, final: d.final });
  } else if (name === RTVIEvent.BotTtsText) {
    s.applyTurn({ type: "botTtsText", t, text: (args[0] as { text: string }).text });
  } else if (name === RTVIEvent.Metrics) {
    s.applyTurn({ type: "metrics", t, data: args[0] as PipecatMetricsData });
  }

  s.addEvent(name, args.map(toInspectable), "in");
}

type AnyHandler = (...args: unknown[]) => void;

export function useEventRecorder(): void {
  const { on, off } = useRTVI();
  useEffect(() => {
    const subs = Object.values(RTVIEvent).map((name) => {
      const handler: AnyHandler = (...args) => record(name, args);
      (on as (e: string, h: AnyHandler) => void)(name, handler);
      return [name, handler] as const;
    });
    return () => subs.forEach(([name, h]) => (off as (e: string, h: AnyHandler) => void)(name, h));
  }, [on, off]);
}
