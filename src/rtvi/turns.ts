/** Groups the RTVI speech events into conversation turns and measures their latency. */
import type { PipecatMetricsData } from "@rezolve-pred/rzlv-rtvi-wrapper";

export interface TurnMetric {
  processor: string;
  kind: "ttfb" | "processing";
  valueMs: number;
}

export interface Turn {
  id: number;
  source: "voice" | "text" | "bot";
  userStart?: number;
  userStop?: number;
  textSentAt?: number;
  botStart?: number;
  botStop?: number;
  userText: string;
  botText: string;
  metrics: TurnMetric[];
}

export type TurnInput =
  | { type: "userStartedSpeaking" | "userStoppedSpeaking" | "botStartedSpeaking" | "botStoppedSpeaking"; t: number }
  | { type: "userTranscript"; t: number; text: string; final: boolean }
  | { type: "botTtsText"; t: number; text: string }
  | { type: "textSent"; t: number; text: string }
  | { type: "metrics"; t: number; data: PipecatMetricsData };

const join = (a: string, b: string) => (a ? `${a} ${b}` : b);

function newTurn(turns: Turn[], init: Partial<Turn> & Pick<Turn, "source">): Turn[] {
  const id = (turns.at(-1)?.id ?? 0) + 1;
  return [...turns, { id, userText: "", botText: "", metrics: [], ...init }];
}

function updateLast(turns: Turn[], patch: (t: Turn) => Partial<Turn>): Turn[] {
  const last = turns.at(-1)!;
  return [...turns.slice(0, -1), { ...last, ...patch(last) }];
}

export function turnReducer(turns: Turn[], input: TurnInput): Turn[] {
  const last = turns.at(-1);
  switch (input.type) {
    case "userStartedSpeaking":
      // User resumed before the bot answered: same turn.
      if (last && last.source !== "bot" && last.botStart === undefined) {
        return updateLast(turns, (l) => ({ userStart: l.userStart ?? input.t, userStop: undefined }));
      }
      return newTurn(turns, { source: "voice", userStart: input.t });
    case "userStoppedSpeaking":
      if (last && last.botStart === undefined) return updateLast(turns, () => ({ userStop: input.t }));
      return turns;
    case "userTranscript":
      if (!input.final) return turns;
      if (last && last.source === "voice") return updateLast(turns, (l) => ({ userText: join(l.userText, input.text) }));
      return newTurn(turns, { source: "voice", userText: input.text });
    case "textSent":
      return newTurn(turns, { source: "text", textSentAt: input.t, userText: input.text });
    case "botStartedSpeaking":
      if (!last) return newTurn(turns, { source: "bot", botStart: input.t });
      // First bot span sets botStart; later spans in the same turn just reopen it.
      return updateLast(turns, (l) => ({ botStart: l.botStart ?? input.t, botStop: undefined }));
    case "botStoppedSpeaking":
      return last ? updateLast(turns, () => ({ botStop: input.t })) : turns;
    case "botTtsText":
      if (!last) return newTurn(turns, { source: "bot", botText: input.text });
      return updateLast(turns, (l) => ({ botText: join(l.botText, input.text) }));
    case "metrics": {
      if (!last) return turns;
      const added: TurnMetric[] = [
        ...(input.data.ttfb ?? []).map((m) => ({ processor: m.processor, kind: "ttfb" as const, valueMs: Math.round(m.value * 1000) })),
        ...(input.data.processing ?? []).map((m) => ({ processor: m.processor, kind: "processing" as const, valueMs: Math.round(m.value * 1000) })),
      ];
      return added.length ? updateLast(turns, (l) => ({ metrics: [...l.metrics, ...added] })) : turns;
    }
  }
}

export function turnLatencyMs(turn: Turn): number | undefined {
  const from = turn.userStop ?? turn.textSentAt;
  if (from === undefined || turn.botStart === undefined) return undefined;
  return turn.botStart - from;
}

export function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
