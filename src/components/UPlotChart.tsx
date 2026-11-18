import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { cssVar } from "@/lib/theme";
import { usePrefs } from "@/store/prefsStore";

export interface ChartSeries {
  label: string;
  /** CSS variable name, e.g. "--user". */
  color: string;
  values: (number | null | undefined)[];
}

interface Props {
  title: string;
  unit: string;
  times: number[]; // ms epoch
  series: ChartSeries[];
  height?: number;
}

/** Thin uPlot wrapper: builds once per theme/series shape, then only pushes data. */
export function UPlotChart({ title, unit, times, series, height = 140 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const theme = usePrefs((s) => s.theme);
  const shape = series.map((s) => `${s.label}:${s.color}`).join("|");

  const data: uPlot.AlignedData = [times.map((t) => t / 1000), ...series.map((s) => s.values.map((v) => v ?? null))];
  const dataRef = useRef(data);

  // Declared before the build effect so a freshly built plot starts from the latest data.
  useEffect(() => {
    dataRef.current = data;
    plotRef.current?.setData(data);
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const dim = cssVar("--text-dim");
    const grid = cssVar("--line");
    const axis = { stroke: dim, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: "11px JetBrains Mono" };
    const plot = new uPlot(
      {
        width: host.clientWidth || 300,
        height,
        legend: { show: true, live: true },
        cursor: { drag: { x: false, y: false } },
        scales: { x: { time: true } },
        axes: [axis, { ...axis, size: 48, values: (_u, vals) => vals.map((v) => `${v}${unit}`) }],
        series: [{}, ...series.map((s) => ({ label: s.label, stroke: cssVar(s.color), width: 1.5, points: { show: false } }))],
      },
      dataRef.current,
      host,
    );
    plotRef.current = plot;
    const ro = new ResizeObserver(() => plot.setSize({ width: host.clientWidth, height }));
    ro.observe(host);
    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, shape, height, unit]);

  return (
    <figure className="min-w-0 rounded-lg border border-line bg-raised p-2">
      <figcaption className="mb-1 px-1 text-xs font-medium">{title}</figcaption>
      <div ref={hostRef} className="w-full" />
    </figure>
  );
}
