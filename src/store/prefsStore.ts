/** Persisted user preferences: theme, credentials, session controls. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Theme } from "@/lib/theme";

export interface Prefs {
  theme: Theme;
  roomUrl: string;
  token: string;
  chatMode: "voice" | "text";
  noiseFilter: boolean;
  botVolume: number;
  wrapperLogging: boolean;
  set(patch: Partial<Omit<Prefs, "set">>): void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      theme: "dark",
      roomUrl: "",
      token: "",
      chatMode: "voice",
      noiseFilter: false,
      botVolume: 1,
      wrapperLogging: false,
      set: (patch) => set(patch),
    }),
    { name: "rtvi-tester:prefs" },
  ),
);
