import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveSample, startSampler } from "./stats";

const T = 10_000;
function fixture(overrides: Record<string, Record<string, unknown>> = {}) {
  const entries: Record<string, Record<string, unknown>> = {
    T1: { id: "T1", type: "transport", selectedCandidatePairId: "CP1" },
    CP1: { id: "CP1", type: "candidate-pair", currentRoundTripTime: 0.038, bytesReceived: 20000, bytesSent: 10000, localCandidateId: "L1", remoteCandidateId: "R1", nominated: true, state: "succeeded" },
    L1: { id: "L1", type: "local-candidate", candidateType: "host", protocol: "udp", address: "10.0.0.2", port: 5000 },
    R1: { id: "R1", type: "remote-candidate", candidateType: "relay", protocol: "udp", address: "1.2.3.4", port: 3478 },
    IN1: { id: "IN1", type: "inbound-rtp", kind: "audio", jitter: 0.004, packetsLost: 2, packetsReceived: 98, audioLevel: 0.3, codecId: "C1" },
    C1: { id: "C1", type: "codec", mimeType: "audio/opus" },
    ...overrides,
  };
  return new Map(Object.entries(entries));
}

describe("deriveSample", () => {
  it("derives instantaneous values from a single report", () => {
    const { sample } = deriveSample("pc-2", fixture(), undefined, T);
    expect(sample.rttMs).toBe(38);
    expect(sample.jitterMs).toBe(4);
    expect(sample.codec).toBe("audio/opus");
    expect(sample.levelIn).toBe(0.3);
    expect(sample.pair).toMatchObject({ local: "host", remote: "relay", protocol: "udp", relay: true });
    expect(sample.inKbps).toBeUndefined();
  });

  it("derives rates and loss from the previous counters", () => {
    const prev = { t: T - 1000, bytesIn: 10000, bytesOut: 5000, packetsLost: 0, packetsReceived: 0 };
    const { sample, counters } = deriveSample("pc-2", fixture(), prev, T);
    expect(sample.inKbps).toBe(80);
    expect(sample.outKbps).toBe(40);
    expect(sample.lossPct).toBe(2);
    expect(counters).toEqual({ t: T, bytesIn: 20000, bytesOut: 10000, packetsLost: 2, packetsReceived: 98 });
  });

  it("falls back to the nominated succeeded pair without a transport pointer", () => {
    const { sample } = deriveSample("pc-2", fixture({ T1: { id: "T1", type: "transport" } }), undefined, T);
    expect(sample.rttMs).toBe(38);
  });

  it("reads outbound audio level from media-source", () => {
    const { sample } = deriveSample("pc-1", fixture({ M1: { id: "M1", type: "media-source", kind: "audio", audioLevel: 0.5 } }), undefined, T);
    expect(sample.levelOut).toBe(0.5);
  });
});

describe("startSampler", () => {
  afterEach(() => vi.useRealTimers());

  it("skips closed peer connections", async () => {
    vi.useFakeTimers();
    const open = { connectionState: "connected", getStats: vi.fn(async () => fixture()) };
    const closed = { connectionState: "closed", getStats: vi.fn(async () => fixture()) };
    const pcs = new Map([
      ["pc-1", open as unknown as RTCPeerConnection],
      ["pc-2", closed as unknown as RTCPeerConnection],
    ]);
    const onReport = vi.fn();
    const stop = startSampler(() => pcs, onReport, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(open.getStats).toHaveBeenCalledTimes(1);
    expect(closed.getStats).not.toHaveBeenCalled();
    expect(onReport).toHaveBeenCalledWith("pc-1", expect.any(Map), expect.objectContaining({ pcId: "pc-1", rttMs: 38 }));
  });
});
