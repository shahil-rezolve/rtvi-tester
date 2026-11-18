import { useRTVI } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { JsonTree } from "@/components/JsonTree";
import { toInspectable } from "@/lib/inspectable";
import { useNow } from "@/lib/useNow";

function DeviceList({ title, devices, selectedId }: { title: string; devices: MediaDeviceInfo[]; selectedId?: string }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-medium">{title}</h3>
      {devices.length === 0 ? (
        <p className="text-xs text-dim">None reported yet.</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {devices.map((d) => (
            <li key={d.deviceId || d.label} className="flex gap-2">
              <span className={d.deviceId === selectedId ? "text-user" : "text-dim"}>{d.deviceId === selectedId ? "●" : "○"}</span>
              <span className="truncate">{d.label || d.deviceId}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DevicesPanel() {
  const rtvi = useRTVI();
  useNow(1000, rtvi.isInRoom); // track readyState/muted aren't reactive
  const tracks = { local: toInspectable(rtvi.tracks.local), bot: toInspectable(rtvi.tracks.bot ?? {}) };

  return (
    <div className="grid h-full gap-4 overflow-y-auto p-3 md:grid-cols-2">
      <div className="space-y-4">
        <DeviceList title="Microphones" devices={rtvi.availableMics} selectedId={rtvi.selectedMic?.deviceId} />
        <DeviceList title="Speakers" devices={rtvi.availableSpeakers} selectedId={rtvi.selectedSpeaker?.deviceId} />
        <dl className="grid grid-cols-2 gap-1 text-xs">
          {(
            [
              ["Bot joined", rtvi.isBotJoined],
              ["Bot speaking", rtvi.isBotSpeaking],
              ["Mic muted", rtvi.isMuted],
              ["Noise filter", rtvi.isNoiseFilterEnabled],
              ["Sharing screen", rtvi.isSharingScreen],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dim">{k}</dt>
              <dd className={v ? "text-ok" : ""}>{v ? "yes" : "no"}</dd>
            </div>
          ))}
        </dl>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-medium">Media tracks</h3>
        <JsonTree data={tracks} expandAll />
      </section>
    </div>
  );
}
