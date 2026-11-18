import { useMemo, useState } from "react";
import { Send, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/CopyButton";
import { JsonTree } from "@/components/JsonTree";
import { parseCurl, type CurlRequest, type ProxyResponse } from "@/curl/parseCurl";
import { fmtMs, levelText } from "@/lib/format";
import { sessionStore } from "@/store/sessionStore";

const CORS_HINT = "The API blocked the browser request (CORS). Run the tester with pnpm dev or pnpm preview to use the proxy.";

async function runRequest(req: CurlRequest): Promise<ProxyResponse> {
  const viaProxy = await fetch("/__proxy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) }).catch(() => undefined);
  if (viaProxy && viaProxy.status !== 404) {
    const json = await viaProxy.json();
    if (!viaProxy.ok) throw new Error(json.error ?? `Proxy error ${viaProxy.status}`);
    return json;
  }
  // Static build: no proxy, try the browser directly.
  const started = performance.now();
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.method === "GET" ? undefined : req.body });
    return { status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), body: await res.text(), durationMs: Math.round(performance.now() - started) };
  } catch (e) {
    throw new Error(e instanceof TypeError ? CORS_HINT : (e as Error).message, { cause: e });
  }
}

/** Every string/number leaf with its path, so URL and token are one click away. */
function leaves(v: unknown, path = ""): { path: string; value: string }[] {
  if (v !== null && typeof v === "object") return Object.entries(v).flatMap(([k, val]) => leaves(val, path ? `${path}.${k}` : k));
  return typeof v === "string" || typeof v === "number" ? [{ path: path || "(body)", value: String(v) }] : [];
}

export function CurlRunner() {
  const [cmd, setCmd] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ProxyResponse>();
  const [error, setError] = useState<string>();

  const parsed = useMemo(() => {
    if (!cmd.trim()) return undefined;
    try {
      return { req: parseCurl(cmd) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [cmd]);

  const body = useMemo(() => {
    if (!response) return undefined;
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return undefined;
    }
  }, [response]);

  const send = async () => {
    if (!parsed?.req) return;
    setLoading(true);
    setError(undefined);
    setResponse(undefined);
    try {
      setResponse(await runRequest(parsed.req));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const statusLevel = response ? (response.status < 300 ? "ok" : response.status < 500 ? "warn" : "bad") : undefined;

  return (
    <div className="space-y-3">
      <Textarea
        aria-label="curl command"
        placeholder={"curl -X POST https://api.example.com/start \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"agent\":\"demo\"}'"}
        value={cmd}
        onChange={(e) => setCmd(e.target.value)}
        spellCheck={false}
        className="min-h-24 font-mono text-xs"
      />
      {parsed?.error && <p className="text-xs text-bad">{parsed.error}</p>}
      {parsed?.req && (
        <div className="space-y-1 rounded-sm border border-line bg-raised p-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">{parsed.req.method}</Badge>
            <span className="truncate font-mono" title={parsed.req.url}>{parsed.req.url}</span>
          </div>
          {Object.entries(parsed.req.headers).map(([k, v]) => (
            <div key={k} className="truncate font-mono text-dim">
              {k}: {v}
            </div>
          ))}
          {parsed.req.body && <div className="truncate font-mono text-dim">{parsed.req.body}</div>}
        </div>
      )}
      <Button className="w-full" variant="secondary" disabled={!parsed?.req || loading} onClick={send}>
        <Send /> {loading ? "Sending…" : "Send request"}
      </Button>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      {response && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <span className={`num font-medium ${statusLevel ? levelText[statusLevel] : ""}`}>
              {response.status} {response.statusText}
            </span>
            <span className="num text-dim">{fmtMs(response.durationMs)}</span>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => sessionStore.getState().select({ kind: "response", value: { ...response, body: body ?? response.body } })}>
              <ScanSearch /> Inspect
            </Button>
          </div>
          {body !== undefined ? (
            <>
              <ul className="divide-y divide-line rounded-sm border border-line">
                {leaves(body).slice(0, 30).map((leaf) => (
                  <li key={leaf.path} className="flex items-center gap-2 px-2 py-1 text-xs">
                    <span className="w-24 shrink-0 truncate text-dim" title={leaf.path}>{leaf.path}</span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={leaf.value}>{leaf.value}</span>
                    <CopyButton text={leaf.value} label="Copy" />
                  </li>
                ))}
              </ul>
              <div className="max-h-64 overflow-auto rounded-sm border border-line p-2">
                <JsonTree data={body} />
              </div>
            </>
          ) : (
            <pre className="max-h-64 overflow-auto rounded-sm border border-line p-2 font-mono text-xs whitespace-pre-wrap break-all">{response.body || "(empty body)"}</pre>
          )}
        </div>
      )}
    </div>
  );
}
