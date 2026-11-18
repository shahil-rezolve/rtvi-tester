import { useState } from "react";
import { UPlotChart } from "@/components/UPlotChart";
import { Chip } from "@/components/FilterBar";
import { useSession } from "@/store/sessionStore";

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="num truncate text-xs" title={value}>
        {value ?? "–"}
      </dd>
    </div>
  );
}

export function NetworkPanel() {
  const pcs = useSession((s) => s.pcs);
  const list = Object.values(pcs);
  const [chosen, setChosen] = useState<string>();
  const pc = (chosen && pcs[chosen]) || list.find((p) => p.role === "subscriber") || list[0];

  if (!pc) return <p className="p-6 text-xs text-dim">Network stats appear once a peer connection exists. Connect to a room first.</p>;

  const s = pc.samples;
  const times = s.map((x) => x.t);
  const last = s.at(-1);
  const pick = (k: keyof (typeof s)[number]) => s.map((x) => x[k] as number | undefined);

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {list.map((p) => (
          <Chip key={p.id} active={p.id === pc.id} onClick={() => setChosen(p.id)}>
            {p.id} {p.role}
          </Chip>
        ))}
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line bg-raised p-3 sm:grid-cols-4">
        <Fact label="Candidate pair" value={last?.pair && `${last.pair.local} → ${last.pair.remote}`} />
        <Fact label="Transport" value={last?.pair && `${last.pair.protocol ?? "?"}${last.pair.relay ? ", via TURN relay" : ", direct"}`} />
        <Fact label="Remote address" value={last?.pair?.remoteAddress} />
        <Fact label="Audio codec" value={last?.codec} />
      </dl>
      <div className="grid gap-3 lg:grid-cols-2">
        <UPlotChart title="Round-trip time" unit="ms" times={times} series={[{ label: "RTT", color: "--user", values: pick("rttMs") }]} />
        <UPlotChart title="Jitter (inbound audio)" unit="ms" times={times} series={[{ label: "jitter", color: "--bot", values: pick("jitterMs") }]} />
        <UPlotChart title="Packet loss (inbound audio)" unit="%" times={times} series={[{ label: "loss", color: "--bad", values: pick("lossPct") }]} />
        <UPlotChart
          title="Bitrate"
          unit="k"
          times={times}
          series={[
            { label: "in kbps", color: "--bot", values: pick("inKbps") },
            { label: "out kbps", color: "--user", values: pick("outKbps") },
          ]}
        />
        <UPlotChart
          title="Audio level"
          unit=""
          times={times}
          series={[
            { label: "bot (in)", color: "--bot", values: pick("levelIn") },
            { label: "you (out)", color: "--user", values: pick("levelOut") },
          ]}
        />
      </div>
    </div>
  );
}
