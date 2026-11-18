import type { ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

/** Resizable group whose sizes survive reloads. */
function SavedGroup({ id, orientation, children }: { id: string; orientation: "horizontal" | "vertical"; children: ReactNode }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: `rtvi-tester:${id}`, storage: localStorage });
  return (
    <ResizablePanelGroup id={id} orientation={orientation} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      {children}
    </ResizablePanelGroup>
  );
}

interface Props {
  topBar: ReactNode;
  rail: ReactNode;
  turns: ReactNode;
  tabs: ReactNode;
  inspector: ReactNode;
}

export function Layout({ topBar, rail, turns, tabs, inspector }: Props) {
  return (
    <div className="flex h-full flex-col">
      {topBar}
      <div className="min-h-0 flex-1">
        <SavedGroup id="root" orientation="horizontal">
          <ResizablePanel id="rail" defaultSize="24%" minSize="240px" maxSize="40%">
            <aside aria-label="Session setup" className="h-full overflow-y-auto bg-raised">
              {rail}
            </aside>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="main">
            <SavedGroup id="main" orientation="vertical">
              <ResizablePanel id="turns" defaultSize="32%" minSize="80px">
                {turns}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="bottom">
                <SavedGroup id="bottom" orientation="horizontal">
                  <ResizablePanel id="tabs" defaultSize="68%" minSize="30%">
                    {tabs}
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel id="inspector" defaultSize="32%" minSize="200px">
                    {inspector}
                  </ResizablePanel>
                </SavedGroup>
              </ResizablePanel>
            </SavedGroup>
          </ResizablePanel>
        </SavedGroup>
      </div>
    </div>
  );
}
