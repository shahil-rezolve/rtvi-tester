import { useMemo } from "react";
import type { PipecatMetricsData } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { fmtMs } from "@/lib/format";
import { percentile } from "@/rtvi/turns";
import { useSession } from "@/store/sessionStore";

interface Row {
  processor: string;
  kind: "ttfb" | "processing";
  values: number[];
}

function Sparkline({ values }: { values: number[] }) {
  const v = values.slice(-40);
  if (v.length < 2) return null;
  const max = Math.max(...v) || 1;
  const points = v.map((x, i) => `${(i / (v.length - 1)) * 100},${20 - (x / max) * 18}`).join(" ");
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-28" aria-hidden>
      <polyline points={points} fill="none" stroke="var(--bot)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MetricsPanel() {
  const events = useSession((s) => s.events);
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    for (const e of events) {
      if (e.name !== "metrics") continue;
      const d = e.args[0] as PipecatMetricsData;
      for (const kind of ["ttfb", "processing"] as const) {
        for (const m of d?.[kind] ?? []) {
          const key = `${m.processor}|${kind}`;
          const row = map.get(key) ?? { processor: m.processor, kind, values: [] };
          row.values.push(m.value * 1000);
          map.set(key, row);
        }
      }
    }
    return [...map.values()].sort((a, b) => a.processor.localeCompare(b.processor) || a.kind.localeCompare(b.kind));
  }, [events]);

  if (!rows.length) return <p className="p-6 text-xs text-dim">Pipecat sends TTFB and processing-time metrics per service (STT, LLM, TTS) when metrics are enabled on the bot. None received yet.</p>;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background text-left text-dim">
          <tr className="border-b border-line">
            <th className="px-3 py-2 font-medium">Processor</th>
            <th className="px-3 py-2 font-medium">Metric</th>
            <th className="px-3 py-2 text-right font-medium">Last</th>
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">p95</th>
            <th className="px-3 py-2 text-right font-medium">Samples</th>
            <th className="px-3 py-2 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.processor}|${r.kind}`} className="border-b border-line/50">
              <td className="px-3 py-1.5 font-mono">{r.processor}</td>
              <td className="px-3 py-1.5 text-dim">{r.kind === "ttfb" ? "time to first byte" : "processing"}</td>
              <td className="num px-3 py-1.5 text-right">{fmtMs(r.values.at(-1))}</td>
              <td className="num px-3 py-1.5 text-right">{fmtMs(r.values.reduce((a, b) => a + b, 0) / r.values.length)}</td>
              <td className="num px-3 py-1.5 text-right">{fmtMs(percentile(r.values, 95))}</td>
              <td className="num px-3 py-1.5 text-right text-dim">{r.values.length}</td>
              <td className="px-3 py-1.5">
                <Sparkline values={r.values} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
