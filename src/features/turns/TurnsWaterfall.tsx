/**
 * One row per conversation turn, all aligned on the moment the user finished (stopped speaking or sent
 * text). Teal = user speech, amber = bot speech, and the gap between them is the response latency, so
 * slow turns stand out by eye across rows.
 */
import { useEffect, useMemo, useRef } from "react";
import { fmtMs, levelOf, levelText } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";
import { percentile, turnLatencyMs, type Turn } from "@/rtvi/turns";
import { sessionStore, useSession } from "@/store/sessionStore";

const VISIBLE = 60;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const latencyLevel = (ms?: number) => levelOf(ms, 1000, 2000);
const shortName = (p: string) => p.replace(/#\d+$/, "").replace(/Service$/, "");

interface Geometry {
  userMs?: number; // duration before the anchor
  gapMs?: number; // anchor → bot start
  botMs?: number; // bot speech duration
  typed: boolean;
}

/** Positions relative to the anchor (user finished, or bot start for bot-only turns). */
function geometry(t: Turn, now: number): Geometry {
  const anchor = t.userStop ?? t.textSentAt ?? (t.userStart !== undefined && t.botStart === undefined ? now : (t.botStart ?? now));
  const userMs = t.userStart !== undefined ? Math.max(0, Math.min(anchor, t.userStop ?? now) - t.userStart) : undefined;
  const gapMs = t.botStart !== undefined ? Math.max(0, t.botStart - anchor) : undefined;
  const botMs = t.botStart !== undefined ? Math.max(0, (t.botStop ?? now) - t.botStart) : undefined;
  return { userMs, gapMs, botMs, typed: t.source === "text" };
}

function ticks(leftMs: number, rightMs: number): number[] {
  const step = leftMs + rightMs > 16000 ? 2000 : 1000;
  const out: number[] = [];
  for (let v = -Math.floor(leftMs / step) * step; v <= rightMs; v += step) out.push(v);
  return out;
}

export function TurnsWaterfall() {
  const turns = useSession((s) => s.turns);
  const selection = useSession((s) => s.selection);
  const visible = turns.slice(-VISIBLE);
  const last = visible.at(-1);
  const inProgress = !!last && (last.botStart === undefined ? last.userStart !== undefined && last.userStop === undefined : last.botStop === undefined);
  const now = useNow(200, inProgress);
  const listRef = useRef<HTMLOListElement>(null);

  const latencies = useMemo(() => turns.map(turnLatencyMs).filter((v): v is number => v !== undefined), [turns]);
  const geo = visible.map((t) => geometry(t, now));
  const leftMs = clamp(Math.max(0, ...geo.map((g) => g.userMs ?? 0)), 2000, 15000);
  const rightMs = clamp(Math.max(0, ...geo.map((g) => (g.gapMs ?? 0) + (g.botMs ?? 0))), 3000, 20000);
  const total = leftMs + rightMs;
  const x = (ms: number) => `${clamp(((ms + leftMs) / total) * 100, 0, 100)}%`;
  const w = (ms: number) => `${(ms / total) * 100}%`;
  const scale = ticks(leftMs, rightMs);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [turns.length]);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const lastLatency = latencies.at(-1);

  return (
    <section aria-label="Turn latency" className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold">Response latency per turn</h2>
        <dl className="flex gap-5 text-xs">
          {(
            [
              ["Turns", String(turns.length), undefined],
              ["Last", fmtMs(lastLatency), latencyLevel(lastLatency)],
              ["p50", fmtMs(p50), latencyLevel(p50)],
              ["p95", fmtMs(p95), latencyLevel(p95)],
            ] as const
          ).map(([label, value, lvl]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="text-dim">{label}</dt>
              <dd className={cn("num text-[15px] font-medium", lvl && levelText[lvl])}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="ml-auto flex items-center gap-3 text-xs text-dim">
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-4 rounded-[2px] bg-user" /> you
          </span>
          <span className="flex items-center gap-1.5">
            <i className="h-2 w-4 rounded-[2px] bg-bot" /> bot
          </span>
          <span>rows aligned on when you finished</span>
        </p>
      </header>

      {visible.length === 0 ? (
        <p className="m-auto max-w-md p-6 text-center text-xs text-dim">
          Talk to the bot or send a text message. Each turn becomes a row lined up on the moment you finished, so the empty gap before the amber bar is how long the bot took to answer.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[52px_1fr_76px_minmax(0,220px)] gap-3 px-3 pt-1.5 text-[10px] text-dim">
            <span />
            <div className="relative h-3.5">
              {scale.map((v) => (
                <span key={v} className={cn("num absolute -translate-x-1/2", v === 0 && "text-foreground")} style={{ left: x(v) }}>
                  {v === 0 ? "0" : `${v > 0 ? "+" : ""}${v / 1000}s`}
                </span>
              ))}
            </div>
            <span className="text-right">latency</span>
            <span>time to first byte</span>
          </div>
          <ol ref={listRef} className="min-h-0 flex-1 overflow-y-auto pb-2">
            {visible.map((t, i) => {
              const g = geo[i];
              const latency = turnLatencyMs(t);
              const lvl = latencyLevel(latency);
              const selected = selection?.kind === "turn" && selection.value.id === t.id;
              const ttfb = t.metrics.filter((m) => m.kind === "ttfb");
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => sessionStore.getState().select({ kind: "turn", value: t })}
                    aria-label={`Turn ${t.id}, latency ${fmtMs(latency)}`}
                    className={cn(
                      "grid h-8 w-full grid-cols-[52px_1fr_76px_minmax(0,220px)] items-center gap-3 px-3 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                      selected ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <span className="num text-dim">
                      T{t.id}
                      <span className="ml-1 text-[10px]">{t.source === "text" ? "txt" : t.source === "bot" ? "bot" : ""}</span>
                    </span>
                    <span className="relative h-4">
                      {scale.map((v) => (
                        <i key={v} className={cn("absolute inset-y-0 w-px", v === 0 ? "bg-foreground/30" : "bg-line/60")} style={{ left: x(v) }} />
                      ))}
                      {g.userMs !== undefined && <i className="absolute inset-y-0.5 rounded-[2px] bg-user" style={{ left: x(-g.userMs), width: w(Math.min(g.userMs, leftMs)) }} />}
                      {g.typed && <i className="absolute top-1/2 size-2 -translate-1/2 rotate-45 bg-user" style={{ left: x(0) }} title="Typed message sent" />}
                      {g.gapMs !== undefined && g.gapMs > 0 && (
                        <i
                          className={cn("absolute inset-y-1.5 border-y border-dashed opacity-70", lvl === "bad" ? "border-bad" : lvl === "warn" ? "border-warn" : "border-dim")}
                          style={{ left: x(0), width: w(Math.min(g.gapMs, rightMs)) }}
                        />
                      )}
                      {g.botMs !== undefined && <i className="absolute inset-y-0.5 rounded-[2px] bg-bot" style={{ left: x(g.gapMs ?? 0), width: w(Math.min(g.botMs, rightMs - (g.gapMs ?? 0))) }} />}
                    </span>
                    <span className={cn("num text-right font-medium", lvl && levelText[lvl])}>{fmtMs(latency)}</span>
                    <span className="flex min-w-0 gap-1 overflow-hidden [mask-image:linear-gradient(to_right,black_85%,transparent)]">
                      {ttfb.slice(-3).map((m, j) => (
                        <span key={j} className="shrink-0 rounded-sm border border-line px-1 text-[11px] text-dim" title={`${m.processor} time to first byte`}>
                          {shortName(m.processor)} <span className="num text-foreground">{m.valueMs}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
