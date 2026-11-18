/** Turns raw getStats() reports into the handful of numbers the UI charts. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Stat = Record<string, any>;
type StatsMap = Pick<Map<string, Stat>, "get" | "values">;

export interface Counters {
  t: number;
  bytesIn: number;
  bytesOut: number;
  packetsLost: number;
  packetsReceived: number;
}

export interface StatsSample {
  t: number;
  pcId: string;
  rttMs?: number;
  jitterMs?: number;
  lossPct?: number;
  inKbps?: number;
  outKbps?: number;
  levelIn?: number;
  levelOut?: number;
  pair?: { local: string; remote: string; protocol?: string; relay: boolean; localAddress?: string; remoteAddress?: string };
  codec?: string;
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

function selectedPair(report: StatsMap): Stat | undefined {
  for (const s of report.values()) {
    if (s.type === "transport" && s.selectedCandidatePairId) return report.get(s.selectedCandidatePairId);
  }
  for (const s of report.values()) {
    if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded") return s;
  }
  return undefined;
}

export function deriveSample(
  pcId: string,
  report: StatsMap,
  prev: Counters | undefined,
  t: number,
): { sample: StatsSample; counters: Counters } {
  const sample: StatsSample = { t, pcId };
  const pair = selectedPair(report);
  let packetsLost = 0;
  let packetsReceived = 0;
  let inbound: Stat | undefined;

  for (const s of report.values()) {
    if (s.type === "inbound-rtp" && s.kind === "audio") {
      inbound ??= s;
      packetsLost += s.packetsLost ?? 0;
      packetsReceived += s.packetsReceived ?? 0;
    } else if (s.type === "media-source" && s.kind === "audio" && s.audioLevel !== undefined) {
      sample.levelOut = s.audioLevel;
    } else if (s.type === "remote-inbound-rtp" && s.roundTripTime !== undefined && sample.rttMs === undefined) {
      sample.rttMs = round(s.roundTripTime * 1000);
    }
  }

  if (pair) {
    if (pair.currentRoundTripTime !== undefined) sample.rttMs = round(pair.currentRoundTripTime * 1000);
    const local = report.get(pair.localCandidateId);
    const remote = report.get(pair.remoteCandidateId);
    if (local && remote) {
      sample.pair = {
        local: local.candidateType,
        remote: remote.candidateType,
        protocol: local.protocol,
        relay: local.candidateType === "relay" || remote.candidateType === "relay",
        localAddress: local.address && `${local.address}:${local.port}`,
        remoteAddress: remote.address && `${remote.address}:${remote.port}`,
      };
    }
  }

  if (inbound) {
    if (inbound.jitter !== undefined) sample.jitterMs = round(inbound.jitter * 1000);
    if (inbound.audioLevel !== undefined) sample.levelIn = inbound.audioLevel;
    if (inbound.codecId) sample.codec = report.get(inbound.codecId)?.mimeType;
  }

  const counters: Counters = {
    t,
    bytesIn: pair?.bytesReceived ?? 0,
    bytesOut: pair?.bytesSent ?? 0,
    packetsLost,
    packetsReceived,
  };

  if (prev && t > prev.t) {
    const secs = (t - prev.t) / 1000;
    sample.inKbps = round(((counters.bytesIn - prev.bytesIn) * 8) / 1000 / secs);
    sample.outKbps = round(((counters.bytesOut - prev.bytesOut) * 8) / 1000 / secs);
    const lost = counters.packetsLost - prev.packetsLost;
    const total = lost + (counters.packetsReceived - prev.packetsReceived);
    sample.lossPct = total > 0 ? round((Math.max(lost, 0) / total) * 100, 2) : 0;
  }

  return { sample, counters };
}

/** Polls every live PC once per interval. Returns a stop function. */
export function startSampler(
  getPcs: () => Map<string, RTCPeerConnection>,
  onReport: (pcId: string, report: RTCStatsReport, sample: StatsSample) => void,
  intervalMs = 1000,
): () => void {
  const prev = new Map<string, Counters>();
  const id = setInterval(() => {
    for (const [pcId, pc] of getPcs()) {
      if (pc.connectionState === "closed") {
        prev.delete(pcId);
        continue;
      }
      pc.getStats()
        .then((report) => {
          const t = Date.now();
          const { sample, counters } = deriveSample(pcId, report as unknown as StatsMap, prev.get(pcId), t);
          prev.set(pcId, counters);
          onReport(pcId, report, sample);
        })
        .catch(() => {
          /* PC closed mid-poll */
        });
    }
  }, intervalMs);
  return () => clearInterval(id);
}
