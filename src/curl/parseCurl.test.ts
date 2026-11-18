import { describe, expect, it } from "vitest";
import { parseCurl } from "./parseCurl";

describe("parseCurl", () => {
  it("parses a bare GET", () => {
    expect(parseCurl("curl https://a.io/x")).toEqual({ url: "https://a.io/x", method: "GET", headers: {} });
  });

  it("handles line continuations, quoted headers and --data-raw with spaces", () => {
    const r = parseCurl(
      "curl -X POST 'https://a.io' \\\n  -H 'Content-Type: application/json' \\\n  --data-raw '{\"room\": \"r 1\"}'",
    );
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://a.io");
    expect(r.headers["Content-Type"]).toBe("application/json");
    expect(r.body).toBe('{"room": "r 1"}');
  });

  it("defaults to POST when -d is given without -X", () => {
    expect(parseCurl("curl https://a.io -d a=1").method).toBe("POST");
  });

  it("supports --json", () => {
    const r = parseCurl(`curl --json '{"a":1}' https://a.io`);
    expect(r.method).toBe("POST");
    expect(r.body).toBe('{"a":1}');
    expect(r.headers["Content-Type"]).toBe("application/json");
    expect(r.headers["Accept"]).toBe("application/json");
  });

  it("turns -u into a basic auth header", () => {
    expect(parseCurl("curl -u user:pw https://a.io").headers["Authorization"]).toBe("Basic " + btoa("user:pw"));
  });

  it("ignores common no-arg flags and accepts --url", () => {
    const r = parseCurl("curl -s -L -k -v -i --compressed --location --url https://a.io/y");
    expect(r.url).toBe("https://a.io/y");
    expect(r.method).toBe("GET");
  });

  it("handles double quotes with escaped quotes", () => {
    const r = parseCurl('curl https://a.io -H "X-Q: say \\"hi\\""');
    expect(r.headers["X-Q"]).toBe('say "hi"');
  });

  it("handles CRLF continuations", () => {
    expect(parseCurl("curl \\\r\n https://a.io").url).toBe("https://a.io");
  });

  it("throws a clear error without a URL", () => {
    expect(() => parseCurl("curl -H 'X: y'")).toThrow(/No URL/);
  });
});
