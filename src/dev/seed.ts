/** DEV only: `window.__rtviTester.seed()` fills the store with a plausible session so panels can be checked without a room. */
import { DataPacket, UserPacket } from "@livekit/protocol";
import { decodePacket } from "@/diagnostics/livekitPacket";
import { deriveSample, type Counters } from "@/diagnostics/stats";
import { record } from "@/rtvi/useEventRecorder";
import { sessionStore } from "@/store/sessionStore";

const enc = new TextEncoder();
const rtvi = (type: string, data: unknown) =>
  new DataPacket({ participantIdentity: "pipecat-bot", value: { case: "user", value: new UserPacket({ payload: enc.encode(JSON.stringify({ label: "rtvi-ai", id: crypto.randomUUID().slice(0, 8), type, data })) }) } }).toBinary();

function seed() {
  const s = sessionStore.getState();
  s.clear();
  const t0 = Date.now() - 120_000;
  sessionStore.setState({ sessionStart: t0 });
  const at = (ms: number, fn: () => void) => {
    const real = Date.now;
    Date.now = () => t0 + ms;
    try {
      fn();
    } finally {
      Date.now = real;
    }
  };

  at(0, () => {
    s.pcCreated("pc-1", { iceServers: [{ urls: "turn:turn.example:443", username: "u", credential: "x" }] });
    s.setPcRole("pc-1", "publisher");
    s.pcCreated("pc-2", {});
    s.setPcRole("pc-2", "subscriber");
    for (const [type, value] of [["createOffer", {}], ["createOfferOnSuccess", { type: "offer", sdp: "v=0\r\no=- 4611 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2" }], ["iceconnectionstatechange", "checking"], ["connectionstatechange", "connected"]] as const)
      s.addPcLog({ t: Date.now(), pcId: "pc-1", type, value });
    record("transportStateChanged", ["connecting"]);
  });
  at(400, () => record("connected", []));
  at(900, () => record("botConnected", [{ id: "pipecat-bot", name: "pipecat-bot", local: false }]));
  at(1200, () => {
    record("botReady", [{ version: "1.0.0" }]);
    s.addDc({ t: Date.now(), pcId: "pc-2", channel: "_reliable", dir: "in", bytes: 96, decoded: decodePacket(rtvi("bot-ready", { version: "1.0.0" })) });
    s.addDc({ t: Date.now(), pcId: "pc-1", channel: "_reliable", dir: "out", bytes: 64, decoded: decodePacket(rtvi("client-ready", {})) });
  });

  const turns: [number, number, number, number, string, string][] = [
    [3000, 4800, 5620, 8000, "Hi, what can you do?", "I can help you test this voice pipeline end to end."],
    [12000, 13500, 14420, 17000, "How fast are you?", "Usually under a second."],
    [21000, 22400, 24600, 27000, "Tell me a long story", "Once upon a time, a packet crossed a TURN relay."],
    [31000, 31900, 32600, 34000, "Thanks", "Any time."],
  ];
  for (const [us, ue, bs, be, said, reply] of turns) {
    at(us, () => record("userStartedSpeaking", []));
    at(us + 400, () => record("userTranscript", [{ text: said.split(" ")[0], final: false }]));
    at(ue, () => record("userStoppedSpeaking", []));
    at(ue + 120, () => record("userTranscript", [{ text: said, final: true }]));
    at(ue + 300, () => record("metrics", [{ ttfb: [{ processor: "DeepgramSTTService#0", value: 0.21 }, { processor: "OpenAILLMService#0", value: (bs - ue) / 2000 }] }]));
    at(bs - 80, () => record("metrics", [{ ttfb: [{ processor: "CartesiaTTSService#0", value: 0.18 }], processing: [{ processor: "OpenAILLMService#0", value: (bs - ue) / 1500 }] }]));
    at(bs, () => record("botStartedSpeaking", []));
    reply.split(" ").forEach((word, i) =>
      at(bs + i * 180, () => {
        record("botTtsText", [{ text: word }]);
        s.addDc({ t: Date.now(), pcId: "pc-2", channel: "_reliable", dir: "in", bytes: 80 + word.length, decoded: decodePacket(rtvi("bot-tts-text", { text: word })) });
      }),
    );
    at(be, () => record("botStoppedSpeaking", []));
  }
  at(36000, () => {
    s.addDc({ t: Date.now(), pcId: "pc-2", channel: "_reliable", dir: "in", bytes: 40, decoded: decodePacket(new DataPacket({ value: { case: "user", value: new UserPacket({ payload: enc.encode("not json"), topic: "chat" }) } }).toBinary()) });
    s.addDc({ t: Date.now(), pcId: "pc-2", channel: "_lossy", dir: "in", bytes: 3, decoded: decodePacket(new Uint8Array([255, 1, 2])) });
  });

  let prev: Counters | undefined;
  for (let i = 0; i < 110; i++) {
    const t = t0 + i * 1000;
    const report = new Map<string, Record<string, unknown>>([
      ["T1", { id: "T1", type: "transport", selectedCandidatePairId: "CP1" }],
      ["CP1", { id: "CP1", type: "candidate-pair", currentRoundTripTime: 0.035 + Math.sin(i / 7) * 0.01 + (i > 60 && i < 70 ? 0.12 : 0), bytesReceived: i * 4200, bytesSent: i * 3900, localCandidateId: "L1", remoteCandidateId: "R1", state: "succeeded", nominated: true }],
      ["L1", { id: "L1", type: "local-candidate", candidateType: "srflx", protocol: "udp", address: "203.0.113.7", port: 52311 }],
      ["R1", { id: "R1", type: "remote-candidate", candidateType: "host", protocol: "udp", address: "198.51.100.20", port: 7882 }],
      ["IN1", { id: "IN1", type: "inbound-rtp", kind: "audio", jitter: 0.003 + Math.abs(Math.sin(i / 5)) * 0.006, packetsLost: Math.floor(i / 25), packetsReceived: i * 50, audioLevel: Math.abs(Math.sin(i / 3)) * 0.4, codecId: "C1" }],
      ["C1", { id: "C1", type: "codec", mimeType: "audio/opus", clockRate: 48000 }],
    ]);
    const { sample, counters } = deriveSample("pc-2", report, prev, t);
    prev = counters;
    s.addStats("pc-2", report as unknown as RTCStatsReport, sample);
  }
}

(window as unknown as { __rtviTester: object }).__rtviTester = { seed };
if (new URLSearchParams(location.search).has("seed")) seed();
