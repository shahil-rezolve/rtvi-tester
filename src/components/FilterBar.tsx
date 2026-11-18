import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterBar({ children, query, onQuery, count }: { children?: ReactNode; query: string; onQuery: (q: string) => void; count: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5">
      <label className="flex h-7 items-center gap-1.5 rounded-sm border border-line bg-raised px-2 focus-within:ring-1 focus-within:ring-ring">
        <Search className="size-3.5 text-dim" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Filter" aria-label="Filter rows" className="w-36 bg-transparent text-xs outline-none" />
      </label>
      {children}
      <span className="num ml-auto text-xs text-dim">{count}</span>
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-6 rounded-sm border px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active ? "border-foreground/30 bg-accent text-foreground" : "border-line text-dim hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Toggle membership of `key` in a set, returning a new set. */
export function toggle<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
