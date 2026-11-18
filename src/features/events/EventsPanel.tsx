import { useMemo, useState } from "react";
import { VirtualLog } from "@/components/VirtualLog";
import { Chip, FilterBar, toggle } from "@/components/FilterBar";
import { fmtRel, preview } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession, sessionStore, type EventEntry } from "@/store/sessionStore";
import { EVENT_GROUPS, groupOf, partyOf, partyText, type EventGroup } from "./eventGroups";

const GROUPS: EventGroup[] = [...(Object.keys(EVENT_GROUPS) as EventGroup[]), "outbound", "tester"];

export function EventsPanel() {
  const events = useSession((s) => s.events);
  const start = useSession((s) => s.sessionStart);
  const selection = useSession((s) => s.selection);
  const [hidden, setHidden] = useState<Set<EventGroup>>(new Set());
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return events.filter((e) => !hidden.has(groupOf(e.name, e.dir)) && (!q || e.name.toLowerCase().includes(q) || preview(e.args, 400).toLowerCase().includes(q)));
  }, [events, hidden, query]);

  const selectedKey = selection?.kind === "event" ? selection.value.id : undefined;

  return (
    <VirtualLog<EventEntry>
      items={rows}
      rowKey={(e) => e.id}
      selectedKey={selectedKey}
      onSelect={(e) => sessionStore.getState().select({ kind: "event", value: e })}
      empty="No events yet. Connect to a room and every wrapper event will show up here."
      header={
        <FilterBar query={query} onQuery={setQuery} count={`${rows.length} / ${events.length}`}>
          {GROUPS.map((g) => (
            <Chip key={g} active={!hidden.has(g)} onClick={() => setHidden((h) => toggle(h, g))}>
              {g}
            </Chip>
          ))}
        </FilterBar>
      }
      renderRow={(e, i) => {
        const prev = rows[i - 1];
        const party = partyOf(e.name, e.dir);
        return (
          <>
            <span className="num w-20 shrink-0 text-dim">{fmtRel(e.t, start)}</span>
            <span className="num w-14 shrink-0 text-right text-dim">{prev ? `${e.t - prev.t}` : ""}</span>
            <span className={cn("w-44 shrink-0 truncate font-medium", party && partyText[party])}>{e.name}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-dim">{preview(e.args.length === 1 ? e.args[0] : e.args)}</span>
          </>
        );
      }}
    />
  );
}
