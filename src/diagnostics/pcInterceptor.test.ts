import { beforeEach, describe, expect, it } from "vitest";
import { installPcInterceptor, type DcMessage, type PcLogEntry, type PcRole, type PcSink } from "./pcInterceptor";

class FakeDC extends EventTarget {
  sent: unknown[] = [];
  constructor(public label: string) {
    super();
  }
  send(d: unknown) {
    this.sent.push(d);
  }
}

class FakePC extends EventTarget {
  static generateCertificate = () => "cert";
  connectionState = "new";
  constructor(public config?: RTCConfiguration) {
    super();
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  createDataChannel(label: string) {
    return new FakeDC(label);
  }
}

function makeSink() {
  const created: string[] = [];
  const roles: Record<string, PcRole> = {};
  const logs: PcLogEntry[] = [];
  const msgs: DcMessage[] = [];
  const sink: PcSink = {
    onPcCreated: (id) => created.push(id),
    onPcRole: (id, role) => (roles[id] = role),
    onLog: (e) => logs.push(e),
    onDcMessage: (m) => msgs.push(m),
  };
  return { sink, created, roles, logs, msgs };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPC = any;

describe("installPcInterceptor", () => {
  let target: { RTCPeerConnection: AnyPC };
  let s: ReturnType<typeof makeSink>;
  let uninstall: () => void;

  beforeEach(() => {
    target = { RTCPeerConnection: FakePC };
    s = makeSink();
    uninstall = installPcInterceptor(s.sink, target as AnyPC);
  });

  it("keeps instanceof and statics working", () => {
    const pc = new target.RTCPeerConnection({ iceServers: [] });
    expect(pc).toBeInstanceOf(FakePC);
    expect(target.RTCPeerConnection.generateCertificate).toBe(FakePC.generateCertificate);
    expect(s.created).toEqual(["pc-1"]);
  });

  it("marks the PC that creates an offer as publisher and logs the call", async () => {
    const pc = new target.RTCPeerConnection();
    await pc.createOffer();
    expect(s.roles["pc-1"]).toBe("publisher");
    expect(s.logs.map((l) => l.type)).toEqual(expect.arrayContaining(["createOffer", "createOfferOnSuccess"]));
  });

  it("marks the PC that receives an offer first as subscriber", async () => {
    const pc = new target.RTCPeerConnection();
    await pc.setRemoteDescription({ type: "offer", sdp: "v=0" });
    expect(s.roles["pc-1"]).toBe("subscriber");
  });

  it("taps outbound data-channel sends without swallowing them", () => {
    const pc = new target.RTCPeerConnection();
    const dc = pc.createDataChannel("_reliable");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    dc.send(bytes);
    expect(dc.sent).toEqual([bytes]);
    expect(s.msgs[0]).toMatchObject({ pcId: "pc-1", channel: "_reliable", dir: "out", bytes: 4 });
  });

  it("taps inbound messages on created and announced channels", () => {
    const pc = new target.RTCPeerConnection();
    const dc = pc.createDataChannel("_reliable");
    dc.dispatchEvent(Object.assign(new Event("message"), { data: "hi" }));
    const remote = new FakeDC("_lossy");
    pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: remote }));
    remote.dispatchEvent(Object.assign(new Event("message"), { data: "yo" }));
    expect(s.msgs.map((m) => [m.channel, m.dir])).toEqual([
      ["_reliable", "in"],
      ["_lossy", "in"],
    ]);
  });

  it("logs state changes", () => {
    const pc = new target.RTCPeerConnection();
    pc.connectionState = "connected";
    pc.dispatchEvent(new Event("connectionstatechange"));
    expect(s.logs.at(-1)).toMatchObject({ type: "connectionstatechange", value: "connected" });
  });

  it("restores the original constructor on uninstall", () => {
    uninstall();
    expect(target.RTCPeerConnection).toBe(FakePC);
  });
});
