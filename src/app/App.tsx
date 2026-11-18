import { RTVIAudio, RTVIProvider } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RailSection } from "@/components/RailSection";
import { ComposerPanel } from "@/features/composer/ComposerPanel";
import { ConnectionPanel } from "@/features/connection/ConnectionPanel";
import { ControlsPanel } from "@/features/controls/ControlsPanel";
import { CurlRunner } from "@/features/curl-runner/CurlRunner";
import { DataChannelPanel } from "@/features/data-channel/DataChannelPanel";
import { DevicesPanel } from "@/features/devices/DevicesPanel";
import { EventsPanel } from "@/features/events/EventsPanel";
import { InspectorPanel } from "@/features/inspector/InspectorPanel";
import { MetricsPanel } from "@/features/metrics/MetricsPanel";
import { NetworkPanel } from "@/features/network/NetworkPanel";
import { PeerConnectionsPanel } from "@/features/peer-connections/PeerConnectionsPanel";
import { TranscriptPanel } from "@/features/transcript/TranscriptPanel";
import { TurnsWaterfall } from "@/features/turns/TurnsWaterfall";
import { useEventRecorder } from "@/rtvi/useEventRecorder";
import { useSessionControls } from "@/rtvi/useSessionControls";
import { usePrefs } from "@/store/prefsStore";
import { useSession } from "@/store/sessionStore";
import { Layout } from "./Layout";
import { TopBar } from "./TopBar";

function Rail() {
  return (
    <>
      <RailSection title="Connection">
        <ConnectionPanel />
      </RailSection>
      <RailSection title="Get a token with cURL" defaultOpen={false}>
        <CurlRunner />
      </RailSection>
      <RailSection title="Controls">
        <ControlsPanel />
      </RailSection>
      <RailSection title="Send to bot">
        <ComposerPanel />
      </RailSection>
    </>
  );
}

const Count = ({ n }: { n: number }) => (n ? <Badge variant="secondary" className="num h-4 px-1 text-[10px]">{n > 999 ? "999+" : n}</Badge> : null);

function MainTabs() {
  const events = useSession((s) => s.events.length);
  const dc = useSession((s) => s.dc.length);
  const pcs = useSession((s) => Object.keys(s.pcs).length);
  const panels = [
    ["events", "Events", <Count n={events} />, <EventsPanel />],
    ["data", "Data channel", <Count n={dc} />, <DataChannelPanel />],
    ["metrics", "Pipecat metrics", null, <MetricsPanel />],
    ["network", "Network", null, <NetworkPanel />],
    ["pcs", "Peer connections", <Count n={pcs} />, <PeerConnectionsPanel />],
    ["transcript", "Transcript", null, <TranscriptPanel />],
    ["devices", "Devices & tracks", null, <DevicesPanel />],
  ] as const;

  return (
    <Tabs defaultValue="events" className="flex h-full min-h-0 flex-col gap-0">
      <TabsList variant="line" className="h-9 w-full shrink-0 justify-start overflow-x-auto border-b border-line px-2">
        {panels.map(([id, label, badge]) => (
          <TabsTrigger key={id} value={id} className="flex-none gap-1.5">
            {label}
            {badge}
          </TabsTrigger>
        ))}
      </TabsList>
      {panels.map(([id, , , panel]) => (
        <TabsContent key={id} value={id} className="min-h-0">
          {panel}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Session() {
  useEventRecorder();
  useSessionControls();
  const chatMode = usePrefs((s) => s.chatMode);
  const botVolume = usePrefs((s) => s.botVolume);
  return (
    <>
      <Layout topBar={<TopBar />} rail={<Rail />} turns={<TurnsWaterfall />} tabs={<MainTabs />} inspector={<InspectorPanel />} />
      <RTVIAudio muted={chatMode === "text"} volume={botVolume} />
    </>
  );
}

export function App() {
  const wrapperLogging = usePrefs((s) => s.wrapperLogging);
  return (
    <RTVIProvider transport="livekit" defaultAudioEnabled={false} enableLogging={wrapperLogging}>
      <Session />
    </RTVIProvider>
  );
}
