/**
 * Reconciles persisted intent (chat mode → mic, noise filter) with the transport once a room exists.
 * Same pattern as rtvi-wrapper/src/App.tsx:60-101; createReconciler makes sure a toggle made while a
 * previous one is still in flight is applied once that one settles, instead of being dropped.
 */
import { useEffect, useRef } from "react";
import { useRTVI } from "@rezolve-pred/rzlv-rtvi-wrapper";
import { usePrefs } from "@/store/prefsStore";
import { sessionStore } from "@/store/sessionStore";
import { createReconciler } from "./reconcile";

const report = (what: string) => (e: Error) => sessionStore.getState().addEvent(`tester: ${what} failed`, [e.message]);

export function useSessionControls(): void {
  const rtvi = useRTVI();
  const chatMode = usePrefs((s) => s.chatMode);
  const noiseFilter = usePrefs((s) => s.noiseFilter);
  const rtviRef = useRef(rtvi);
  const sync = useRef<{ mic: () => Promise<void>; noiseFilter: () => Promise<void> }>(null);

  // Declared first so the effects below see this render's rtvi.
  useEffect(() => {
    rtviRef.current = rtvi;
    sync.current ??= {
      mic: createReconciler(
        () => usePrefs.getState().chatMode === "voice",
        (on) => rtviRef.current.enableMicrophone(on).catch(report("mic toggle")),
      ),
      noiseFilter: createReconciler(
        () => usePrefs.getState().noiseFilter,
        (on) => rtviRef.current.enableNoiseFilter(on).catch(report("noise filter")),
      ),
    };
  });

  useEffect(() => {
    if (rtvi.isInRoom) void sync.current?.mic();
  }, [chatMode, rtvi.isInRoom]);

  useEffect(() => {
    if (rtvi.isInRoom && rtvi.isNoiseFilterEnabled !== noiseFilter) void sync.current?.noiseFilter();
  }, [rtvi.isInRoom, noiseFilter, rtvi.isNoiseFilterEnabled]);
}
