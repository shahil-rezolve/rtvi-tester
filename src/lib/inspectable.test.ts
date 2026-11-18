import { describe, expect, it } from "vitest";
import { toInspectable } from "./inspectable";

describe("toInspectable", () => {
  it("flattens errors", () => expect(toInspectable(new Error("x"))).toEqual({ name: "Error", message: "x" }));
  it("summarises byte arrays", () => expect(toInspectable(new Uint8Array(5))).toEqual({ bytes: 5 }));
  it("uses toJSON when present", () => expect(toInspectable({ toJSON: () => ({ a: 1 }) })).toEqual({ a: 1 }));
  it("passes plain data through", () => expect(toInspectable({ a: [1, "b"] })).toEqual({ a: [1, "b"] }));
});
