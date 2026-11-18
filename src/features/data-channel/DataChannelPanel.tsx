import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { VirtualLog } from "@/components/VirtualLog";
import { Chip, FilterBar, toggle } from "@/components/FilterBar";
import { fmtBytes, fmtRel, preview } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession, sessionStore, type DcEntry } from "@/store/sessionStore";
import type { DecodedPacket } from "@/diagnostics/livekitPacket";

const KINDS: DecodedPacket["kind"][] = ["rtvi", "json", "text", "other", "error"];
const KIND_TONE: Record<DecodedPacket["kind"], string> = { rtvi: "border-foreground/25", json: "border-line", text: "border-line", other: "border-line text-dim", error: "border-bad/50 text-bad" };

function summary(d: DecodedPacket): string {
  switch (d.kind) {
    case "rtvi":
      return `${d.json.type}  ${preview((d.json as { data?: unknown }).data, 200)}`;
    case "json":
      return preview(d.json, 200);
    case "text":
      return d.text;
    case "other":
      return d.packetCase;
    case "error":
      return `undecodable (${d.error})`;
  }
}

export function DataChannelPanel() {
  const dc = useSession((s) => s.dc);
  const pcs = useSession((s) => s.pcs);
  const start = useSession((s) => s.sessionStart);
  const selection = useSession((s) => s.selection);
  const [dirs, setDirs] = useState(new Set(["in", "out"]));
  const [kinds, setKinds] = useState(new Set<string>(KINDS));
  const [hideLossy, setHideLossy] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return dc.filter(
      (m) => dirs.has(m.dir) && kinds.has(m.decoded.kind) && !(hideLossy && m.channel === "_lossy") && (!q || summary(m.decoded).toLowerCase().includes(q) || m.channel.includes(q)),
    );
  }, [dc, dirs, kinds, hideLossy, query]);

  return (
    <VirtualLog<DcEntry>
      items={rows}
      rowKey={(m) => m.id}
      selectedKey={selection?.kind === "dc" ? selection.value.id : undefined}
      onSelect={(m) => sessionStore.getState().select({ kind: "dc", value: m })}
      empty="No data-channel traffic yet. Every packet sent or received on LiveKit's data channels appears here, including ones the wrapper ignores."
      header={
        <FilterBar query={query} onQuery={setQuery} count={`${rows.length} / ${dc.length}`}>
          <Chip active={dirs.has("in")} onClick={() => setDirs((d) => toggle(d, "in"))}>
            received
          </Chip>
          <Chip active={dirs.has("out")} onClick={() => setDirs((d) => toggle(d, "out"))}>
            sent
          </Chip>
          <span className="mx-1 h-4 w-px bg-line" />
          {KINDS.map((k) => (
            <Chip key={k} active={kinds.has(k)} onClick={() => setKinds((s) => toggle(s, k))}>
              {k}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-line" />
          <Chip active={hideLossy} onClick={() => setHideLossy((v) => !v)}>
            hide lossy
          </Chip>
        </FilterBar>
      }
      renderRow={(m) => (
        <>
          <span className="num w-20 shrink-0 text-dim">{fmtRel(m.t, start)}</span>
          {m.dir === "in" ? <ArrowDownLeft className="size-3.5 shrink-0 text-bot" aria-label="received" /> : <ArrowUpRight className="size-3.5 shrink-0 text-user" aria-label="sent" />}
          <span className="w-28 shrink-0 truncate font-mono text-dim">
            {m.channel} <span className="opacity-70">{pcs[m.pcId]?.role.slice(0, 3) ?? ""}</span>
          </span>
          <span className="num w-14 shrink-0 text-right text-dim">{fmtBytes(m.bytes)}</span>
          <span className={cn("w-12 shrink-0 rounded-sm border px-1 text-center text-[11px]", KIND_TONE[m.decoded.kind])}>{m.decoded.kind}</span>
          <span className="min-w-0 flex-1 truncate font-mono">{summary(m.decoded)}</span>
        </>
      )}
    />
  );
}
