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

const ANSI_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", e: "\x1b" };

/** Body of a $'…' string starting at `i` (just past the opening quote); returns [text, index of closing quote]. */
function ansiC(cmd: string, i: number): [string, number] {
  let out = "";
  for (; i < cmd.length && cmd[i] !== "'"; i++) {
    if (cmd[i] !== "\\" || i + 1 >= cmd.length) {
      out += cmd[i];
      continue;
    }
    const c = cmd[++i];
    const hex = c === "u" ? cmd.slice(i + 1, i + 5) : c === "x" ? cmd.slice(i + 1, i + 3) : "";
    if (hex && /^[0-9a-f]+$/i.test(hex)) {
      out += String.fromCharCode(parseInt(hex, 16));
      i += hex.length;
    } else out += ANSI_ESCAPES[c] ?? c;
  }
  return [out, i];
}

/** Split a shell command into words: handles '…', $'…' (Chrome "Copy as cURL"), "…" (with \ escapes) and bare words. */
function tokenize(cmd: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let inWord = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "$" && cmd[i + 1] === "'") {
      const [text, end] = ansiC(cmd, i + 2);
      cur += text;
      i = end;
      inWord = true;
    } else if (c === "'") {
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
// Flags whose next word is their value, so it must never be taken as the URL.
const VALUE_FLAGS_IGNORED = new Set([
  ...["-o", "--output", "-m", "--max-time", "--connect-timeout", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie"],
  ...["-x", "--proxy", "-w", "--write-out", "-F", "--form", "-T", "--upload-file", "-r", "--range", "-c", "--cookie-jar"],
  ...["-K", "--config", "-E", "--cert", "--key", "--cacert", "--capath", "--resolve", "--retry", "--limit-rate", "--interface"],
]);
const SHORT_VALUE_FLAGS = new Set(["-X", "-H", "-d", "-u", ...[...VALUE_FLAGS_IGNORED].filter((f) => f.length === 2)]);

/** `-XPUT` → `-X PUT`, `-H'A: b'` → `-H A: b` (curl allows a short flag's value attached). */
const splitAttached = (t: string) => (t.length > 2 && SHORT_VALUE_FLAGS.has(t.slice(0, 2)) ? [t.slice(0, 2), t.slice(2)] : [t]);

export function parseCurl(cmd: string): CurlRequest {
  const tokens = tokenize(cmd.replace(/\\\r?\n/g, " ").trim()).flatMap(splitAttached);
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
    else url ??= t;
  }

  if (!url) throw new Error("No URL found in curl command");
  if (!/^[a-z][\w+.-]*:\/\//i.test(url)) url = `http://${url}`; // curl's own default for scheme-less URLs
  return { url, method: method ?? (body !== undefined ? "POST" : "GET"), headers, ...(body !== undefined && { body }) };
}
