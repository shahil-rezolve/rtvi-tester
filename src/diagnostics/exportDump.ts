/** Export formats: a tester bundle (everything recorded) and a chrome://webrtc-internals compatible dump. */
import type { SessionState } from "@/store/sessionStore";

const SECRET_KEYS = /^(token|credential|password|authorization)$/i;

export function redactToken(token?: string): string | undefined {
  return token === undefined ? undefined : `…${token.slice(-6)}`;
}

/** Deep copy with secret-looking string fields masked. */
function redactDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) => [k, SECRET_KEYS.test(k) && typeof val === "string" ? redactToken(val) : redactDeep(val)]),
    );
  }
  return v;
}

export interface ExportMeta {
  userAgent: string;
  url: string;
  roomUrl?: string;
  token?: string;
}

export function buildBundle(state: SessionState, meta: ExportMeta) {
  return redactDeep({
    format: "rtvi-tester-bundle@1",
    exportedAt: new Date().toISOString(),
    meta,
    sessionStart: state.sessionStart,
    turns: state.turns,
    events: state.events,
    dataChannel: state.dc,
    peerConnections: Object.values(state.pcs).map(({ reports: _reports, ...pc }) => pc),
  });
}

interface InternalsStat {
  startTime: string;
  endTime: string;
  statsType: string;
  values: string;
}

export function buildInternalsDump(state: SessionState, meta: Omit<ExportMeta, "roomUrl" | "token">) {
  const PeerConnections: Record<
    string,
    { pid: number; url: string; rtcConfiguration: string; constraints: string; updateLog: { time: string; type: string; value: string }[]; stats: Record<string, InternalsStat> }
  > = {};

  for (const pc of Object.values(state.pcs)) {
    const series: Record<string, { statsType: string; times: number[]; values: unknown[] }> = {};
    for (const { t, stats } of pc.reports) {
      for (const stat of Object.values(stats)) {
        for (const [prop, value] of Object.entries(stat)) {
          if (prop === "id" || prop === "type" || prop === "timestamp" || (value !== null && typeof value === "object")) continue;
          const entry = (series[`${stat.id}-${prop}`] ??= { statsType: stat.type, times: [], values: [] });
          entry.times.push(t);
          entry.values.push(value);
        }
      }
    }

    PeerConnections[pc.id] = {
      pid: 0,
      url: meta.url,
      rtcConfiguration: JSON.stringify(redactDeep(pc.config ?? {})),
      constraints: "",
      updateLog: pc.log.map((e) => ({
        time: new Date(e.t).toISOString(),
        type: e.type,
        value: typeof e.value === "string" ? e.value : JSON.stringify(redactDeep(e.value) ?? ""),
      })),
      stats: Object.fromEntries(
        Object.entries(series).map(([key, s]) => [
          key,
          {
            startTime: new Date(s.times[0]).toISOString(),
            endTime: new Date(s.times.at(-1)!).toISOString(),
            statsType: s.statsType,
            values: JSON.stringify(s.values),
          },
        ]),
      ),
    };
  }

  return { getUserMedia: [] as unknown[], PeerConnections, UserAgent: meta.userAgent };
}

export function downloadJson(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
