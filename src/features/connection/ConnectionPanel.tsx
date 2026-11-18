import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRTVI } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePrefs } from "@/store/prefsStore";
import { sessionStore } from "@/store/sessionStore";

export function ConnectionPanel() {
  const rtvi = useRTVI();
  const { roomUrl, token, chatMode, set } = usePrefs();
  const [reveal, setReveal] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string>();

  const urlLooksWrong = roomUrl.trim() !== "" && !/^wss?:\/\//i.test(roomUrl.trim());
  const canConnect = roomUrl.trim() !== "" && token.trim() !== "" && !pending;

  const connect = async () => {
    setFailure(undefined);
    setPending(true);
    sessionStore.getState().addEvent("→ connect", [{ roomUrl: roomUrl.trim(), audio: chatMode === "voice" }], "out");
    try {
      await rtvi.connect(roomUrl.trim(), token.trim(), { audio: chatMode === "voice" });
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const disconnect = async () => {
    sessionStore.getState().addEvent("→ disconnect", [], "out");
    try {
      await rtvi.disconnect();
    } catch (e) {
      setFailure((e as Error).message);
    }
  };

  const error = failure ?? rtvi.error?.message;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rtvi.isInRoom && canConnect) void connect();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="room-url">LiveKit URL</Label>
        <Input id="room-url" placeholder="wss://your-project.livekit.cloud" value={roomUrl} onChange={(e) => set({ roomUrl: e.target.value })} disabled={rtvi.isInRoom} spellCheck={false} />
        {urlLooksWrong && <p className="text-xs text-warn">LiveKit URLs usually start with wss://</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="token">Token</Label>
        <div className="flex gap-1">
          <Input id="token" type={reveal ? "text" : "password"} placeholder="Participant access token" value={token} onChange={(e) => set({ token: e.target.value })} disabled={rtvi.isInRoom} spellCheck={false} className="font-mono" />
          <Button type="button" variant="ghost" size="icon" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Hide token" : "Show token"}>
            {reveal ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      {rtvi.isInRoom ? (
        <Button type="button" variant="destructive" className="w-full" onClick={disconnect}>
          Disconnect
        </Button>
      ) : (
        <Button type="submit" className="w-full" disabled={!canConnect}>
          {pending ? "Connecting…" : "Connect"}
        </Button>
      )}
      {error && (
        <p role="alert" className="rounded-sm border border-bad/40 bg-bad/10 px-2 py-1.5 text-xs text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
