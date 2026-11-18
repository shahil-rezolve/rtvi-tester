/**
 * Wraps the global RTCPeerConnection so every PC livekit-client creates is visible to the tester:
 * SDP/ICE/state log (webrtc-internals naming), role detection and data-channel traffic both ways.
 * Must be installed before livekit-client constructs its first PC (see src/diagnostics/install.ts).
 * Diagnostics must never break the call, so every sink call is guarded.
 */
import { decodePacket, type DecodedPacket } from "./livekitPacket";

export type PcRole = "publisher" | "subscriber" | "unknown";

export interface PcLogEntry {
  t: number;
  pcId: string;
  type: string;
  value: unknown;
}

export interface DcMessage {
  t: number;
  pcId: string;
  channel: string;
  dir: "in" | "out";
  bytes: number;
  decoded: DecodedPacket;
}

export interface PcSink {
  onPcCreated(pcId: string, pc: RTCPeerConnection, config: RTCConfiguration | undefined): void;
  onPcRole(pcId: string, role: PcRole): void;
  onLog(e: PcLogEntry): void;
  onDcMessage(m: DcMessage): void;
}

type DataLike = string | ArrayBuffer | ArrayBufferView | Blob;

const STATE_EVENTS = {
  connectionstatechange: "connectionState",
  iceconnectionstatechange: "iceConnectionState",
  icegatheringstatechange: "iceGatheringState",
  signalingstatechange: "signalingState",
} as const;

const ASYNC_METHODS = ["createOffer", "createAnswer", "setLocalDescription", "setRemoteDescription", "addIceCandidate"] as const;

function safe(fn: () => void) {
  try {
    fn();
  } catch (e) {
    console.warn("[rtvi-tester] diagnostics sink error", e);
  }
}

function plain(v: unknown): unknown {
  if (v && typeof v === "object" && "toJSON" in v && typeof (v as { toJSON: unknown }).toJSON === "function") {
    return (v as { toJSON(): unknown }).toJSON();
  }
  return v;
}

function emitMessage(sink: PcSink, pcId: string, channel: string, dir: "in" | "out", data: DataLike) {
  const t = Date.now();
  const push = (payload: ArrayBuffer | Uint8Array | string, bytes: number) =>
    safe(() => sink.onDcMessage({ t, pcId, channel, dir, bytes, decoded: decodePacket(payload) }));

  if (typeof data === "string") push(data, new TextEncoder().encode(data).byteLength);
  else if (data instanceof ArrayBuffer) push(data, data.byteLength);
  else if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    push(view.slice(), view.byteLength); // copy: the sender may reuse its buffer
  } else if (typeof Blob !== "undefined" && data instanceof Blob) {
    void data.arrayBuffer().then((buf) => push(buf, buf.byteLength));
  }
}

function tapDataChannel(dc: RTCDataChannel, pcId: string, sink: PcSink) {
  const label = dc.label;
  dc.addEventListener("message", (e) => emitMessage(sink, pcId, label, "in", (e as MessageEvent).data));
  for (const type of ["open", "close", "error"]) {
    dc.addEventListener(type, () => safe(() => sink.onLog({ t: Date.now(), pcId, type: `datachannel.${type}`, value: label })));
  }
  const originalSend = dc.send.bind(dc) as (d: DataLike) => void;
  (dc as { send: (d: DataLike) => void }).send = (data: DataLike) => {
    safe(() => emitMessage(sink, pcId, label, "out", data));
    return originalSend(data);
  };
}

function instrument(pc: RTCPeerConnection, pcId: string, config: RTCConfiguration | undefined, sink: PcSink) {
  const log = (type: string, value: unknown) => safe(() => sink.onLog({ t: Date.now(), pcId, type, value: plain(value) }));
  let role: PcRole = "unknown";
  const setRole = (r: PcRole) => {
    if (role !== "unknown") return;
    role = r;
    safe(() => sink.onPcRole(pcId, r));
  };

  safe(() => sink.onPcCreated(pcId, pc, config));
  log("create", config ?? {});

  const methods = pc as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ASYNC_METHODS) {
    const original = methods[name]?.bind(pc);
    if (!original) continue;
    methods[name] = (...args: unknown[]) => {
      const desc = args[0] as RTCSessionDescriptionInit | undefined;
      if (name === "createOffer") setRole("publisher");
      if (name === "setRemoteDescription" && desc?.type === "offer") setRole("subscriber");
      if (name === "setLocalDescription" && desc?.type === "offer") setRole("publisher");
      log(name, args[0]);
      const result = original(...args);
      if (result instanceof Promise) {
        return result.then(
          (v) => {
            log(`${name}OnSuccess`, v);
            return v;
          },
          (err) => {
            log(`${name}OnFailure`, String(err));
            throw err;
          },
        );
      }
      return result;
    };
  }

  const originalCreateDc = pc.createDataChannel.bind(pc);
  pc.createDataChannel = (label: string, init?: RTCDataChannelInit) => {
    const dc = originalCreateDc(label, init);
    log("createDataChannel", { label, ...init });
    tapDataChannel(dc, pcId, sink);
    return dc;
  };

  const originalClose = pc.close?.bind(pc);
  if (originalClose) {
    pc.close = () => {
      log("close", null);
      originalClose();
    };
  }

  for (const [event, prop] of Object.entries(STATE_EVENTS)) {
    pc.addEventListener(event, () => log(event, (pc as unknown as Record<string, unknown>)[prop]));
  }
  pc.addEventListener("icecandidate", (e) => log("icecandidate", (e as RTCPeerConnectionIceEvent).candidate));
  pc.addEventListener("icecandidateerror", (e) => {
    const err = e as RTCPeerConnectionIceErrorEvent;
    log("icecandidateerror", { url: err.url, errorCode: err.errorCode, errorText: err.errorText });
  });
  pc.addEventListener("track", (e) => {
    const { track, streams } = e as RTCTrackEvent;
    log("track", { kind: track.kind, id: track.id, streams: streams.map((s) => s.id) });
  });
  pc.addEventListener("datachannel", (e) => {
    const dc = (e as RTCDataChannelEvent).channel;
    log("datachannel", { label: dc.label, id: dc.id, protocol: dc.protocol });
    tapDataChannel(dc, pcId, sink);
  });
}

export function installPcInterceptor(
  sink: PcSink,
  target: { RTCPeerConnection?: typeof RTCPeerConnection } = globalThis,
): () => void {
  const Original = target.RTCPeerConnection;
  if (!Original) return () => {};
  let count = 0;

  // Subclassing keeps instanceof and inherited statics (generateCertificate) intact.
  class InstrumentedRTCPeerConnection extends Original {
    constructor(config?: RTCConfiguration) {
      super(config);
      instrument(this, `pc-${++count}`, config, sink);
    }
  }

  target.RTCPeerConnection = InstrumentedRTCPeerConnection;
  return () => {
    target.RTCPeerConnection = Original;
  };
}
