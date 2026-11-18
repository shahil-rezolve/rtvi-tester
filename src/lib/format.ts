export const fmtRel = (t: number, start: number) => `${t < start ? "−" : "+"}${(Math.abs(t - start) / 1000).toFixed(3)}s`;

export const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });

export const fmtMs = (ms: number | undefined) => (ms === undefined ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** One-line JSON preview for log rows. */
export function preview(v: unknown, max = 160): string {
  if (v === undefined) return "";
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export type Level = "ok" | "warn" | "bad";
export const levelOf = (v: number | undefined, warn: number, bad: number): Level | undefined =>
  v === undefined ? undefined : v >= bad ? "bad" : v >= warn ? "warn" : "ok";

export const levelText: Record<Level, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };
