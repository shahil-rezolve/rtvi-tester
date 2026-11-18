import { RTVIEvent } from "@rezolve-pred/rzlv-rtvi-wrapper";

export const EVENT_GROUPS = {
  connection: [RTVIEvent.Connected, RTVIEvent.Disconnected, RTVIEvent.TransportStateChanged, RTVIEvent.BotStarted, RTVIEvent.BotConnected, RTVIEvent.BotReady, RTVIEvent.BotDisconnected, RTVIEvent.ParticipantConnected, RTVIEvent.ParticipantLeft, RTVIEvent.Error, RTVIEvent.MessageError],
  speech: [RTVIEvent.UserStartedSpeaking, RTVIEvent.UserStoppedSpeaking, RTVIEvent.BotStartedSpeaking, RTVIEvent.BotStoppedSpeaking],
  transcript: [RTVIEvent.UserTranscript, RTVIEvent.BotOutput, RTVIEvent.BotTranscript, RTVIEvent.BotTtsText, RTVIEvent.BotLlmText],
  "llm & tts": [RTVIEvent.BotLlmStarted, RTVIEvent.BotLlmStopped, RTVIEvent.LLMFunctionCall, RTVIEvent.BotLlmSearchResponse, RTVIEvent.BotTtsStarted, RTVIEvent.BotTtsStopped],
  server: [RTVIEvent.ServerMessage, RTVIEvent.ServerResponse],
  metrics: [RTVIEvent.Metrics],
  media: [RTVIEvent.TrackStarted, RTVIEvent.TrackStopped, RTVIEvent.ScreenTrackStarted, RTVIEvent.ScreenTrackStopped, RTVIEvent.ScreenShareError],
  devices: [RTVIEvent.AvailableCamsUpdated, RTVIEvent.AvailableMicsUpdated, RTVIEvent.AvailableSpeakersUpdated, RTVIEvent.CamUpdated, RTVIEvent.MicUpdated, RTVIEvent.SpeakerUpdated, RTVIEvent.DeviceError],
} as const satisfies Record<string, readonly string[]>;

export type EventGroup = keyof typeof EVENT_GROUPS | "outbound" | "tester";

const lookup = new Map<string, EventGroup>(Object.entries(EVENT_GROUPS).flatMap(([g, names]) => names.map((n) => [n, g as EventGroup])));

export function groupOf(name: string, dir?: "in" | "out"): EventGroup {
  if (dir === "out") return "outbound";
  return lookup.get(name) ?? "tester";
}

/** Who the event is about: drives the teal/amber colour coding. */
export function partyOf(name: string, dir?: "in" | "out"): "user" | "bot" | "error" | undefined {
  if (dir === "out" || name.startsWith("user") || name === RTVIEvent.LocalAudioLevel) return "user";
  if (/error/i.test(name)) return "error";
  if (name.startsWith("bot") || name.startsWith("llm") || name === RTVIEvent.Metrics) return "bot";
  return undefined;
}

export const partyText = { user: "text-user", bot: "text-bot", error: "text-bad" } as const;
