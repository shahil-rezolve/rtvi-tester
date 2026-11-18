import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function RailSection({ title, aside, defaultOpen = true, children }: { title: string; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-b border-line">
      <div className="flex items-center gap-2 px-3 py-2">
        <CollapsibleTrigger className="group flex flex-1 items-center gap-1.5 rounded-sm text-left text-[13px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <ChevronRight className="size-3.5 text-dim transition-transform group-data-[state=open]:rotate-90" />
          {title}
        </CollapsibleTrigger>
        {aside}
      </div>
      <CollapsibleContent className="space-y-3 px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
