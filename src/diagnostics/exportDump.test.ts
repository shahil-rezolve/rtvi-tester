import { describe, expect, it } from "vitest";
import { createSessionStore, pickPc, pushCapped } from "@/store/sessionStore";
import { buildBundle, buildInternalsDump, redactToken } from "./exportDump";

function seeded() {
  const store = createSessionStore();
  const s = store.getState();
  s.pcCreated("pc-1", { iceServers: [{ urls: "turn:x", username: "u", credential: "SECRET-TURN" }] });
  s.addPcLog({ t: 1000, pcId: "pc-1", type: "createOffer", value: undefined });
  const report = (rtt: number) => new Map([["CP1", { id: "CP1", type: "candidate-pair", timestamp: 1, currentRoundTripTime: rtt }]]);
  s.addStats("pc-1", report(0.038) as unknown as RTCStatsReport, { t: 2000, pcId: "pc-1", rttMs: 38 });
  s.addStats("pc-1", report(0.04) as unknown as RTCStatsReport, { t: 3000, pcId: "pc-1", rttMs: 40 });
  return store.getState();
}

describe("pushCapped", () => {
  it("keeps only the last cap items", () => expect(pushCapped([1, 2, 3], 4, 3)).toEqual([2, 3, 4]));
});

describe("redactToken", () => {
  it("keeps the last 6 chars", () => expect(redactToken("abcdefghijkl")).toBe("…ghijkl"));
  it("passes undefined through", () => expect(redactToken(undefined)).toBeUndefined());
});

describe("buildBundle", () => {
  it("never contains the full token or TURN credential", () => {
    const json = JSON.stringify(buildBundle(seeded(), { roomUrl: "wss://lk", token: "eyJSECRETTOKENabc123", userAgent: "UA", url: "http://x" }));
    expect(json).not.toContain("eyJSECRETTOKEN");
    expect(json).toContain("…abc123");
    expect(json).not.toContain("SECRET-TURN");
  });
});

describe("JWT redaction", () => {
  it("masks JWT-looking strings under any key", () => {
    const store = createSessionStore();
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJib3QifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
    store.getState().addEvent("serverMessage", [{ data: { participantToken: jwt, nested: [jwt] } }]);
    const json = JSON.stringify(buildBundle(store.getState(), { userAgent: "UA", url: "x" }));
    expect(json).not.toContain("eyJzdWIiOiJib3QifQ");
  });
});

describe("buildInternalsDump", () => {
  it("produces webrtc-internals shaped update log and stats series", () => {
    const dump = buildInternalsDump(seeded(), { userAgent: "UA", url: "http://x" });
    const pc = dump.PeerConnections["pc-1"];
    expect(pc.updateLog.map((e) => e.type)).toContain("createOffer");
    expect(typeof pc.updateLog[0].time).toBe("string");
    expect(JSON.parse(pc.stats["CP1-currentRoundTripTime"].values)).toEqual([0.038, 0.04]);
    expect(pc.stats["CP1-currentRoundTripTime"].statsType).toBe("candidate-pair");
    expect(JSON.stringify(dump)).not.toContain("SECRET-TURN");
    expect(dump.UserAgent).toBe("UA");
  });
});

describe("pickPc", () => {
  it("prefers the newest live subscriber after a reconnect", () => {
    const store = createSessionStore();
    const s = store.getState();
    for (const [id, role] of [["pc-1", "publisher"], ["pc-2", "subscriber"]] as const) {
      s.pcCreated(id, undefined);
      s.setPcRole(id, role);
    }
    s.addPcLog({ t: 1, pcId: "pc-2", type: "close", value: null });
    s.pcCreated("pc-4", undefined);
    s.setPcRole("pc-4", "subscriber");
    const state = store.getState();
    expect(state.pcs["pc-2"].closed).toBe(true);
    expect(pickPc(state.pcs, "subscriber")?.id).toBe("pc-4");
    expect(pickPc(state.pcs)?.id).toBe("pc-4");
  });
  it("marks a pc closed on connectionstatechange closed", () => {
    const store = createSessionStore();
    store.getState().pcCreated("pc-1", undefined);
    store.getState().addPcLog({ t: 1, pcId: "pc-1", type: "connectionstatechange", value: "closed" });
    expect(store.getState().pcs["pc-1"].closed).toBe(true);
  });
});
