import { describe, expect, it } from "vitest";
import { ActiveSpeakerUpdate, DataPacket, UserPacket } from "@livekit/protocol";
import { decodePacket } from "./livekitPacket";

const enc = new TextEncoder();
const userPacket = (payload: string, topic?: string) =>
  new DataPacket({
    participantIdentity: "bot",
    value: { case: "user", value: new UserPacket({ payload: enc.encode(payload), topic }) },
  }).toBinary();

describe("decodePacket", () => {
  it("recognises an RTVI message in a user packet", () => {
    const d = decodePacket(userPacket(JSON.stringify({ label: "rtvi-ai", type: "bot-ready", id: "1", data: {} })));
    expect(d.kind).toBe("rtvi");
    if (d.kind !== "rtvi") throw new Error();
    expect(d.json.type).toBe("bot-ready");
    expect(d.participant).toBe("bot");
  });

  it("marks JSON without the rtvi label as plain json", () => {
    expect(decodePacket(userPacket('{"hello":1}', "chat")).kind).toBe("json");
  });

  it("returns text for a non-JSON user payload", () => {
    const d = decodePacket(userPacket("hello"));
    expect(d).toMatchObject({ kind: "text", text: "hello", packetCase: "user" });
  });

  it("summarises non-user packet cases", () => {
    const bytes = new DataPacket({ value: { case: "speaker", value: new ActiveSpeakerUpdate({ speakers: [] }) } }).toBinary();
    expect(decodePacket(bytes)).toMatchObject({ kind: "other", packetCase: "speaker" });
  });

  it("never throws on garbage bytes", () => {
    expect(decodePacket(new Uint8Array([255, 1, 2]))).toMatchObject({ kind: "error", byteLength: 3 });
  });

  it("accepts ArrayBuffer input", () => {
    const b = userPacket('{"label":"rtvi-ai","type":"metrics"}');
    expect(decodePacket(b.slice().buffer).kind).toBe("rtvi");
  });

  it("treats string data as a raw-string packet", () => {
    expect(decodePacket('{"x":1}')).toMatchObject({ kind: "json", packetCase: "raw-string", json: { x: 1 } });
  });
});
