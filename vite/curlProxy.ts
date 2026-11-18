/**
 * Dev/preview-only middleware: POST /__proxy runs a parsed curl request server-side so the
 * browser isn't blocked by CORS. Only answers loopback clients so `--host` doesn't expose an open relay.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { CurlRequest, ProxyResponse } from "../src/curl/parseCurl";

const DROP_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding"]);

export async function proxyRequest(req: CurlRequest, fetchImpl: typeof fetch = fetch): Promise<ProxyResponse> {
  const { protocol } = new URL(req.url);
  if (protocol !== "http:" && protocol !== "https:") throw new Error("Only http(s) URLs are allowed");

  const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !DROP_HEADERS.has(k.toLowerCase())));
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const started = performance.now();
  const res = await fetchImpl(req.url, { method: req.method, headers, body: hasBody ? req.body : undefined });
  const body = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    body,
    durationMs: Math.round(performance.now() - started),
  };
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.url !== "/__proxy" || req.method !== "POST") return next();
  const send = (status: number, data: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  };
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "")) return send(403, { error: "Proxy only accepts requests from this machine" });

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    send(200, await proxyRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")) as CurlRequest));
  } catch (e) {
    send(502, { error: (e as Error).message });
  }
}

export function curlProxyPlugin(): Plugin {
  return {
    name: "rtvi-tester-curl-proxy",
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}
