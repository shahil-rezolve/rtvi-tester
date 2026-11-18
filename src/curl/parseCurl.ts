export interface CurlRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** What the /__proxy dev middleware (vite/curlProxy.ts) returns. */
export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

/** Split a shell command into words: handles '…', "…" (with \ escapes) and bare words. */
function tokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let inWord = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      cur += cmd.slice(i + 1, end === -1 ? undefined : end);
      i = end === -1 ? cmd.length : end;
      inWord = true;
    } else if (c === '"') {
      i++;
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === "\\" && i + 1 < cmd.length) i++;
        cur += cmd[i++];
      }
      inWord = true;
    } else if (c === "\\" && i + 1 < cmd.length) {
      cur += cmd[++i];
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) tokens.push(cur);
      cur = "";
      inWord = false;
    } else {
      cur += c;
      inWord = true;
    }
  }
  if (inWord) tokens.push(cur);
  return tokens;
}

const DATA_FLAGS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode"]);
const VALUE_FLAGS_IGNORED = new Set(["-o", "--output", "-m", "--max-time", "--connect-timeout", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie"]);

export function parseCurl(cmd: string): CurlRequest {
  const tokens = tokenize(cmd.replace(/\\\r?\n/g, " ").trim());
  if (tokens[0] === "curl") tokens.shift();

  let url: string | undefined;
  let method: string | undefined;
  const headers: Record<string, string> = {};
  let body: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = () => tokens[++i] ?? "";
    if (t === "-X" || t === "--request") method = next().toUpperCase();
    else if (t === "-H" || t === "--header") {
      const h = next();
      const idx = h.indexOf(":");
      if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    } else if (DATA_FLAGS.has(t)) body = body === undefined ? next() : `${body}&${next()}`;
    else if (t === "--json") {
      body = next();
      headers["Content-Type"] ??= "application/json";
      headers["Accept"] ??= "application/json";
    } else if (t === "-u" || t === "--user") headers["Authorization"] = "Basic " + btoa(next());
    else if (t === "--url") url = next();
    else if (VALUE_FLAGS_IGNORED.has(t)) next();
    else if (t.startsWith("-")) continue; // no-arg flags: -s -L -k -v -i --compressed …
    else if (!url && /^https?:\/\//i.test(t)) url = t;
  }

  if (!url) throw new Error("No URL found in curl command");
  return { url, method: method ?? (body !== undefined ? "POST" : "GET"), headers, ...(body !== undefined && { body }) };
}
