import { describe, expect, it } from "vitest";
import { percentile, turnLatencyMs, turnReducer, type Turn, type TurnInput } from "./turns";

const run = (inputs: TurnInput[]) => inputs.reduce<Turn[]>(turnReducer, []);

describe("turnReducer", () => {
  it("measures voice-to-voice latency for a voice turn", () => {
    const turns = run([
      { type: "userStartedSpeaking", t: 0 },
      { type: "userStoppedSpeaking", t: 1000 },
      { type: "botStartedSpeaking", t: 1812 },
      { type: "botStoppedSpeaking", t: 4000 },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ source: "voice", userStart: 0, userStop: 1000, botStart: 1812, botStop: 4000 });
    expect(turnLatencyMs(turns[0])).toBe(812);
  });

  it("measures latency from send for a text turn", () => {
    const turns = run([
      { type: "textSent", t: 0, text: "hi" },
      { type: "botStartedSpeaking", t: 640 },
    ]);
    expect(turns[0]).toMatchObject({ source: "text", userText: "hi" });
    expect(turnLatencyMs(turns[0])).toBe(640);
  });

  it("creates a bot-only turn for a greeting", () => {
    const turns = run([{ type: "botStartedSpeaking", t: 5 }]);
    expect(turns[0].source).toBe("bot");
    expect(turnLatencyMs(turns[0])).toBeUndefined();
  });

  it("starts a new turn when the user speaks after the bot answered", () => {
    const turns = run([
      { type: "userStartedSpeaking", t: 0 },
      { type: "botStartedSpeaking", t: 900 },
      { type: "userStartedSpeaking", t: 5000 },
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[1].userStart).toBe(5000);
  });

  it("keeps the same turn when the user resumes before the bot answers", () => {
    const turns = run([
      { type: "userStartedSpeaking", t: 0 },
      { type: "userStoppedSpeaking", t: 500 },
      { type: "userStartedSpeaking", t: 700 },
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].userStop).toBeUndefined();
    expect(turns[0].userStart).toBe(0);
  });

  it("appends final transcripts and bot TTS text", () => {
    const turns = run([
      { type: "userStartedSpeaking", t: 0 },
      { type: "userTranscript", t: 1, text: "interim", final: false },
      { type: "userTranscript", t: 2, text: "hello there", final: true },
      { type: "botTtsText", t: 3, text: "Hi" },
      { type: "botTtsText", t: 4, text: "friend" },
    ]);
    expect(turns[0].userText).toBe("hello there");
    expect(turns[0].botText).toBe("Hi friend");
  });

  it("attaches pipecat metrics to the latest turn in ms", () => {
    const turns = run([
      { type: "userStartedSpeaking", t: 0 },
      { type: "metrics", t: 1, data: { ttfb: [{ processor: "OpenAILLMService#0", value: 0.42 }], processing: [{ processor: "TTS#0", value: 0.1 }] } },
    ]);
    expect(turns[0].metrics).toEqual([
      { processor: "OpenAILLMService#0", kind: "ttfb", valueMs: 420 },
      { processor: "TTS#0", kind: "processing", valueMs: 100 },
    ]);
  });
});

describe("percentile", () => {
  it("interpolates linearly", () => expect(percentile([100, 200, 300, 400], 50)).toBe(250));
  it("returns undefined for no values", () => expect(percentile([], 95)).toBeUndefined());
});
