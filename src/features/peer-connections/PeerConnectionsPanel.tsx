import { useMemo, useState } from "react";
import { VirtualLog } from "@/components/VirtualLog";
import { Chip, FilterBar } from "@/components/FilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtRel, preview } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PcLogEntry } from "@/diagnostics/pcInterceptor";
import { sessionStore, useSession, type PcState, type RawStat } from "@/store/sessionStore";

const STATE_EVENTS = ["connectionstatechange", "iceconnectionstatechange"];

function lastState(pc: PcState, type: string): string | undefined {
  for (let i = pc.log.length - 1; i >= 0; i--) if (pc.log[i].type === type) return String(pc.log[i].value);
  return undefined;
}

function StatsTree({ pc }: { pc: PcState }) {
  const [query, setQuery] = useState("");
  const latest = pc.reports.at(-1)?.stats;
  const groups = useMemo(() => {
    const map = new Map<string, RawStat[]>();
    for (const s of Object.values(latest ?? {})) {
      if (query && !JSON.stringify(s).toLowerCase().includes(query.toLowerCase())) continue;
      map.set(s.type, [...(map.get(s.type) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [latest, query]);

  if (!latest) return <p className="p-6 text-xs text-dim">No getStats report yet. The sampler polls once per second.</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FilterBar query={query} onQuery={setQuery} count={`${Object.keys(latest).length} stats`} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map(([type, stats]) => (
          <details key={type} className="border-b border-line/60" open={type === "candidate-pair" || type === "inbound-rtp"}>
            <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium">
              {type} <span className="num text-dim">{stats.length}</span>
            </summary>
            <ul className="pb-1">
              {stats.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => sessionStore.getState().select({ kind: "stat", value: s })} className="flex w-full gap-3 px-6 py-1 text-left text-xs hover:bg-accent/50">
                    <span className="w-40 shrink-0 truncate font-mono">{s.id}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-dim">{preview(Object.fromEntries(Object.entries(s).filter(([k]) => !["id", "type", "timestamp"].includes(k))), 240)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function PcLog({ pc }: { pc: PcState }) {
  const start = useSession((s) => s.sessionStart);
  const selection = useSession((s) => s.selection);
  const [query, setQuery] = useState("");
  const [hideIce, setHideIce] = useState(false);
  const rows = useMemo(
    () => pc.log.filter((e) => !(hideIce && e.type === "icecandidate") && (!query || `${e.type} ${preview(e.value, 400)}`.toLowerCase().includes(query.toLowerCase()))),
    [pc.log, query, hideIce],
  );
  return (
    <VirtualLog<PcLogEntry>
      items={rows}
      rowKey={(e) => pc.log.indexOf(e)}
      selectedKey={selection?.kind === "pclog" ? pc.log.indexOf(selection.value) : undefined}
      onSelect={(e) => sessionStore.getState().select({ kind: "pclog", value: e })}
      header={
        <FilterBar query={query} onQuery={setQuery} count={`${rows.length} / ${pc.log.length}`}>
          <Chip active={hideIce} onClick={() => setHideIce((v) => !v)}>
            hide ICE candidates
          </Chip>
        </FilterBar>
      }
      renderRow={(e) => (
        <>
          <span className="num w-20 shrink-0 text-dim">{fmtRel(e.t, start)}</span>
          <span className={cn("w-56 shrink-0 truncate font-mono", e.type.endsWith("Failure") && "text-bad", STATE_EVENTS.includes(e.type) && "text-foreground")}>{e.type}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-dim">{preview(e.value)}</span>
        </>
      )}
    />
  );
}

export function PeerConnectionsPanel() {
  const pcs = useSession((s) => s.pcs);
  const list = Object.values(pcs);
  const [chosen, setChosen] = useState<string>();
  const pc = (chosen && pcs[chosen]) || list[0];

  if (!pc) return <p className="p-6 text-xs text-dim">No peer connections yet. LiveKit opens a publisher and a subscriber connection when you connect.</p>;

  return (
    <div className="flex h-full min-h-0">
      <ul className="w-48 shrink-0 overflow-y-auto border-r border-line" aria-label="Peer connections">
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setChosen(p.id)} className={cn("w-full px-3 py-2 text-left text-xs", p.id === pc.id ? "bg-accent" : "hover:bg-accent/50")}>
              <span className="font-medium">{p.id}</span> <span className="text-dim">{p.role}</span>
              <span className="mt-0.5 block text-dim">
                {lastState(p, "connectionstatechange") ?? "new"}, ICE {lastState(p, "iceconnectionstatechange") ?? "new"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Tabs defaultValue="log" className="flex min-w-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="h-8 shrink-0 border-b border-line px-2">
          <TabsTrigger value="log">Event log</TabsTrigger>
          <TabsTrigger value="stats">getStats</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="min-h-0">
          <PcLog pc={pc} />
        </TabsContent>
        <TabsContent value="stats" className="min-h-0">
          <StatsTree pc={pc} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
