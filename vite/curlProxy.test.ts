import { describe, expect, it, vi } from "vitest";
import { proxyRequest } from "./curlProxy";

describe("proxyRequest", () => {
  it("rejects non-http URLs", async () => {
    await expect(proxyRequest({ url: "file:///etc/passwd", method: "GET", headers: {} })).rejects.toThrow("Only http(s) URLs are allowed");
  });

  it("returns status, headers, body text and timing", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"url":"wss://x","token":"t"}', { status: 200, headers: { "content-type": "application/json" } }));
    const res = await proxyRequest({ url: "https://api.test/start", method: "POST", headers: { A: "b" }, body: "{}" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.test/start", expect.objectContaining({ method: "POST", body: "{}" }));
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"url":"wss://x","token":"t"}');
    expect(res.headers["content-type"]).toBe("application/json");
    expect(typeof res.durationMs).toBe("number");
  });

  it("drops the body for GET", async () => {
    const fetchImpl = vi.fn(async () => new Response(""));
    await proxyRequest({ url: "https://api.test", method: "GET", headers: {}, body: "x" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.test", expect.objectContaining({ body: undefined }));
  });
});
