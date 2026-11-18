import { Mic, MicOff, MonitorUp, MonitorX } from "lucide-react";
import { useRTVI } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrefs } from "@/store/prefsStore";

function DeviceSelect({ id, label, devices, selected, onChange }: { id: string; label: string; devices: MediaDeviceInfo[]; selected?: string; onChange: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={selected ?? ""} onValueChange={onChange} disabled={!devices.length}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue placeholder={devices.length ? "Default" : "Available after connecting"} />
        </SelectTrigger>
        <SelectContent>
          {devices
            .filter((d) => d.deviceId)
            .map((d) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 12)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Row({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
        {label}
        {hint && <span className="text-xs font-normal text-dim">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

export function ControlsPanel() {
  const rtvi = useRTVI();
  const { chatMode, noiseFilter, botVolume, wrapperLogging, set } = usePrefs();

  return (
    <div className="space-y-3">
      <Tabs value={chatMode} onValueChange={(v) => set({ chatMode: v as "voice" | "text" })}>
        <TabsList className="w-full">
          <TabsTrigger value="voice">Voice</TabsTrigger>
          <TabsTrigger value="text">Text only</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-xs text-dim">{chatMode === "voice" ? "Mic on, bot audio playing." : "Mic off and bot audio muted. Use the composer to talk."}</p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={rtvi.toggleMic} disabled={!rtvi.isInRoom}>
          {rtvi.isMuted ? <MicOff /> : <Mic className="text-user" />}
          {rtvi.isMuted ? "Unmute mic" : "Mute mic"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => rtvi.enableScreenShare(!rtvi.isSharingScreen)} disabled={!rtvi.isInRoom}>
          {rtvi.isSharingScreen ? <MonitorX /> : <MonitorUp />}
          {rtvi.isSharingScreen ? "Stop sharing" : "Share screen"}
        </Button>
      </div>

      <Row id="noise-filter" label="Noise filter" hint={rtvi.isInRoom ? (rtvi.isNoiseFilterEnabled ? "Active" : "Inactive") : "Applied on connect"}>
        <Switch id="noise-filter" checked={noiseFilter} onCheckedChange={(v) => set({ noiseFilter: v })} />
      </Row>
      <Row id="wrapper-logging" label="Wrapper console logs" hint="Verbose logs in DevTools">
        <Switch id="wrapper-logging" checked={wrapperLogging} onCheckedChange={(v) => set({ wrapperLogging: v })} />
      </Row>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <Label htmlFor="bot-volume">Bot volume</Label>
          <span className="num text-xs text-dim">{Math.round(botVolume * 100)}%</span>
        </div>
        <Slider id="bot-volume" min={0} max={1} step={0.05} value={[botVolume]} onValueChange={([v]) => set({ botVolume: v })} />
      </div>

      <DeviceSelect id="mic" label="Microphone" devices={rtvi.availableMics} selected={rtvi.selectedMic?.deviceId} onChange={rtvi.updateMic} />
      <DeviceSelect id="speaker" label="Speaker" devices={rtvi.availableSpeakers} selected={rtvi.selectedSpeaker?.deviceId} onChange={rtvi.updateSpeaker} />
    </div>
  );
}
