import { CopyButton } from "@/components/CopyButton";
import { JsonTree } from "@/components/JsonTree";
import { fmtClock } from "@/lib/format";
import { useSession, type Selection } from "@/store/sessionStore";
import { turnLatencyMs } from "@/rtvi/turns";

function describe(sel: NonNullable<Selection>): { title: string; t?: number; data: unknown; sdp?: string } {
  switch (sel.kind) {
    case "event":
      return { title: sel.value.name, t: sel.value.t, data: sel.value.args.length === 1 ? sel.value.args[0] : sel.value.args };
    case "dc": {
      const { decoded, ...meta } = sel.value;
      return { title: `${sel.value.dir === "in" ? "Received" : "Sent"} on ${sel.value.channel}`, t: sel.value.t, data: { ...meta, decoded } };
    }
    case "pclog": {
      const v = sel.value.value as { sdp?: string } | null;
      return { title: `${sel.value.pcId} ${sel.value.type}`, t: sel.value.t, data: sel.value, sdp: typeof v?.sdp === "string" ? v.sdp : undefined };
    }
    case "turn":
      return { title: `Turn ${sel.value.id}`, data: { latencyMs: turnLatencyMs(sel.value), ...sel.value } };
    case "stat":
      return { title: `${sel.value.type} ${sel.value.id}`, data: sel.value };
    case "response":
      return { title: "cURL response", data: sel.value };
  }
}

export function InspectorPanel() {
  const selection = useSession((s) => s.selection);
  if (!selection) {
    return (
      <section aria-label="Inspector" className="flex h-full items-center justify-center p-6 text-center text-xs text-dim">
        Select any event, packet, turn or stat to see its full payload here.
      </section>
    );
  }
  const { title, t, data, sdp } = describe(selection);
  return (
    <section aria-label="Inspector" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium" title={title}>
          {title}
        </h2>
        {t !== undefined && <span className="num text-xs text-dim">{fmtClock(t)}</span>}
        <CopyButton text={JSON.stringify(data, null, 2)} label="Copy JSON" />
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {sdp && <pre className="mb-3 rounded-sm border border-line bg-raised p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap break-all">{sdp}</pre>}
        <JsonTree data={data} expandAll={selection.kind !== "stat"} />
      </div>
    </section>
  );
}
