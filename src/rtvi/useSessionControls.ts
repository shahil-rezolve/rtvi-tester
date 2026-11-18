/**
 * Reconciles persisted intent (chat mode → mic, noise filter) with the transport once a room exists.
 * Same pattern as rtvi-wrapper/src/App.tsx:60-101, with in-flight guards against overlapping toggles.
 */
import { useEffect, useRef } from "react";
import { useRTVI } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { usePrefs } from "@/store/prefsStore";
import { sessionStore } from "@/store/sessionStore";

export function useSessionControls(): void {
  const rtvi = useRTVI();
  const chatMode = usePrefs((s) => s.chatMode);
  const noiseFilter = usePrefs((s) => s.noiseFilter);
  const micBusy = useRef(false);
  const nfBusy = useRef(false);

  useEffect(() => {
    if (!rtvi.isInRoom || micBusy.current) return;
    micBusy.current = true;
    rtvi
      .enableMicrophone(chatMode === "voice")
      .catch((e: Error) => sessionStore.getState().addEvent("tester: mic toggle failed", [e.message]))
      .finally(() => (micBusy.current = false));
  }, [chatMode, rtvi.isInRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rtvi.isInRoom || nfBusy.current || rtvi.isNoiseFilterEnabled === noiseFilter) return;
    nfBusy.current = true;
    rtvi
      .enableNoiseFilter(noiseFilter)
      .catch((e: Error) => sessionStore.getState().addEvent("tester: noise filter failed", [e.message]))
      .finally(() => (nfBusy.current = false));
  }, [rtvi.isInRoom, noiseFilter, rtvi.isNoiseFilterEnabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
