import { DataPacket } from "@livekit/protocol";

const RTVI_LABEL = "rtvi-ai";

export type DecodedPacket =
  | { kind: "rtvi"; packetCase: string; topic?: string; participant?: string; json: { type: string; [k: string]: unknown } }
  | { kind: "json"; packetCase: string; topic?: string; participant?: string; json: unknown }
  | { kind: "text"; packetCase: string; topic?: string; participant?: string; text: string }
  | { kind: "other"; packetCase: string; participant?: string; summary: unknown }
  | { kind: "error"; error: string; byteLength: number };

const decoder = new TextDecoder();

function classify(text: string, packetCase: string, meta: { topic?: string; participant?: string }): DecodedPacket {
  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object" && json.label === RTVI_LABEL && typeof json.type === "string") {
      return { kind: "rtvi", packetCase, ...meta, json };
    }
    return { kind: "json", packetCase, ...meta, json };
  } catch {
    return { kind: "text", packetCase, ...meta, text };
  }
}

/** Decode one LiveKit data-channel message. Never throws. */
export function decodePacket(data: ArrayBuffer | Uint8Array | string): DecodedPacket {
  if (typeof data === "string") return classify(data, "raw-string", {});
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    const packet = DataPacket.fromBinary(bytes);
    const participant = packet.participantIdentity || undefined;
    const { value } = packet;
    if (value.case === "user") {
      const user = value.value;
      return classify(decoder.decode(user.payload), "user", {
        topic: user.topic || undefined,
        participant: participant ?? (user.participantIdentity || undefined),
      });
    }
    return { kind: "other", packetCase: value.case ?? "unknown", participant, summary: packet.toJson() };
  } catch (e) {
    return { kind: "error", error: (e as Error).message, byteLength: bytes.byteLength };
  }
}
