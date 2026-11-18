import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props<T> {
  items: T[];
  rowKey: (item: T) => string | number;
  renderRow: (item: T, index: number) => ReactNode;
  selectedKey?: string | number;
  onSelect?: (item: T) => void;
  header?: ReactNode;
  empty?: ReactNode;
  rowHeight?: number;
}

/** Virtualized, keyboard-navigable log that follows the tail until the user scrolls up. */
export function VirtualLog<T>({ items, rowKey, renderRow, selectedKey, onSelect, header, empty, rowHeight = 26 }: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => scrollRef.current, estimateSize: () => rowHeight, overscan: 20 });

  useEffect(() => {
    if (follow && items.length) virtualizer.scrollToIndex(items.length - 1, { align: "end" });
  }, [items.length, follow, virtualizer]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < rowHeight * 2);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!onSelect || !items.length || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const current = items.findIndex((it) => rowKey(it) === selectedKey);
    const next = current === -1 ? items.length - 1 : Math.min(items.length - 1, Math.max(0, current + (e.key === "ArrowDown" ? 1 : -1)));
    onSelect(items[next]);
    virtualizer.scrollToIndex(next);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {header}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Log entries"
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {items.length === 0 ? (
          <div className="p-6 text-dim">{empty}</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((row) => {
              const item = items[row.index];
              const key = rowKey(item);
              const selected = key === selectedKey;
              return (
                <div
                  key={key}
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelect?.(item)}
                  className={cn(
                    "absolute inset-x-0 flex cursor-default items-center gap-3 border-b border-line/50 px-3 text-xs",
                    selected ? "bg-accent" : "hover:bg-accent/50",
                  )}
                  style={{ top: row.start, height: rowHeight }}
                >
                  {renderRow(item, row.index)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!follow && items.length > 0 && (
        <Button size="xs" variant="secondary" className="absolute right-4 bottom-3" onClick={() => setFollow(true)}>
          <ArrowDown /> Jump to latest
        </Button>
      )}
    </div>
  );
}
