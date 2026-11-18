import { useState } from "react";
import { Download, Moon, Sun, Trash2, Clipboard } from "lucide-react";
import { RTVIEvent, useRTVI, useRTVIEvent, type TransportState } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildBundle, buildInternalsDump, downloadJson } from "@/diagnostics/exportDump";
import { fmtDuration, levelOf, levelText } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/utils";
import { usePrefs } from "@/store/prefsStore";
import { pickPc, sessionStore, useSession } from "@/store/sessionStore";
import type { StatsSample } from "@/diagnostics/stats";

const STATE_TONE: Partial<Record<TransportState, string>> = { connected: "bg-ok", ready: "bg-ok", error: "bg-bad", disconnected: "bg-dim" };

function useConnectedSince(): number | undefined {
  const [since, setSince] = useState<number>();
  useRTVIEvent(RTVIEvent.Connected, () => setSince(Date.now()));
  useRTVIEvent(RTVIEvent.Disconnected, () => setSince(undefined));
  return since;
}

/** Latest sample from the current subscriber PC (it carries the bot's inbound audio), else from any PC. */
function useLatestSample(): StatsSample | undefined {
  return useSession((s) => (pickPc(s.pcs, "subscriber") ?? pickPc(s.pcs))?.samples.at(-1));
}

function Chip({ label, value, unit, warn, bad }: { label: string; value?: number; unit: string; warn: number; bad: number }) {
  const lvl = levelOf(value, warn, bad);
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-dim">{label}</span>
      <span className={cn("num", lvl && levelText[lvl])}>{value === undefined ? "–" : `${value}${unit}`}</span>
    </span>
  );
}

function Meter({ label, level, active, tone }: { label: string; level: number; active: boolean; tone: "user" | "bot" }) {
  return (
    <span className="flex items-center gap-1.5" aria-label={`${label} level`}>
      <span className={cn(active ? (tone === "user" ? "text-user" : "text-bot") : "text-dim")}>{label}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
        <span className={cn("block h-full", tone === "user" ? "bg-user" : "bg-bot")} style={{ width: `${Math.min(100, level * 100)}%` }} />
      </span>
    </span>
  );
}

export function TopBar() {
  const rtvi = useRTVI();
  const { theme, roomUrl, token, set } = usePrefs();
  const since = useConnectedSince();
  const now = useNow(1000, since !== undefined);
  const sample = useLatestSample();
  const levels = useSession((s) => s.levels);
  const tone = STATE_TONE[rtvi.connectionState] ?? "bg-warn";

  const meta = () => ({ userAgent: navigator.userAgent, url: location.href, roomUrl: rtvi.connectionParams?.roomUrl ?? roomUrl, token: rtvi.connectionParams?.token ?? token });
  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

  return (
    <header className="flex h-11 shrink-0 items-center gap-5 border-b border-line bg-raised px-3 text-xs">
      <span className="text-[13px] font-semibold tracking-tight">RTVI Tester</span>

      <span className="flex items-center gap-2" role="status">
        <span className={cn("size-2 rounded-full", tone)} />
        <span className="font-medium">{rtvi.connectionState}</span>
        {since !== undefined && <span className="num text-dim">{fmtDuration(now - since)}</span>}
      </span>

      <span className="hidden items-center gap-4 lg:flex">
        <Chip label="RTT" value={sample?.rttMs} unit=" ms" warn={150} bad={300} />
        <Chip label="Jitter" value={sample?.jitterMs} unit=" ms" warn={30} bad={60} />
        <Chip label="Loss" value={sample?.lossPct} unit="%" warn={1} bad={5} />
      </span>

      <span className="hidden items-center gap-4 xl:flex">
        <Meter label="You" level={levels.local} active={!rtvi.isMuted} tone="user" />
        <Meter label={rtvi.isBotSpeaking ? "Bot speaking" : "Bot"} level={levels.remote} active={rtvi.isBotJoined} tone="bot" />
      </span>

      <span className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Download /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => downloadJson(`rtvi-session-${stamp()}.json`, buildBundle(sessionStore.getState(), meta()))}>Diagnostics bundle (.json)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadJson(`webrtc-internals-${stamp()}.json`, buildInternalsDump(sessionStore.getState(), meta()))}>webrtc-internals dump (.json)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText("chrome://webrtc-internals")}>
              <Clipboard /> webrtc-internals
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copies chrome://webrtc-internals. Chrome blocks pages from opening it, so paste it in a new tab.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear session data"
              onClick={() => {
                if (confirm("Clear all recorded events, messages, turns and stats?")) sessionStore.getState().clear();
              }}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear session data</TooltipContent>
        </Tooltip>

        <Button variant="ghost" size="icon-sm" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => set({ theme: theme === "dark" ? "light" : "dark" })}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </span>
    </header>
  );
}
