/** Single store for everything the tester records. Written from React hooks and from the non-React interceptor. */
import { createStore, useStore } from "zustand";
import type { DcMessage, PcLogEntry, PcRole } from "@/diagnostics/pcInterceptor";
import type { StatsSample } from "@/diagnostics/stats";
import { turnReducer, type Turn, type TurnInput } from "@/rtvi/turns";

export const LOG_CAP = 5000;
export const SAMPLE_CAP = 600; // 10 min at 1 Hz

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawStat = Record<string, any>;

export interface EventEntry {
  id: number;
  t: number;
  name: string;
  dir?: "in" | "out";
  args: unknown[];
}

export type DcEntry = DcMessage & { id: number };

export interface PcState {
  id: string;
  role: PcRole;
  createdAt: number;
  config?: RTCConfiguration;
  log: PcLogEntry[];
  samples: StatsSample[];
  /** Raw getStats history (same cap as samples) for the webrtc-internals dump. */
  reports: { t: number; stats: Record<string, RawStat> }[];
}

export type Selection =
  | { kind: "event"; value: EventEntry }
  | { kind: "dc"; value: DcEntry }
  | { kind: "pclog"; value: PcLogEntry }
  | { kind: "turn"; value: Turn }
  | { kind: "stat"; value: RawStat }
  | { kind: "response"; value: unknown }
  | null;

export interface SessionState {
  sessionStart: number;
  events: EventEntry[];
  dc: DcEntry[];
  pcs: Record<string, PcState>;
  turns: Turn[];
  levels: { local: number; remote: number };
  interim: string;
  selection: Selection;

  addEvent(name: string, args: unknown[], dir?: "in" | "out"): void;
  addDc(m: DcMessage): void;
  pcCreated(id: string, config: RTCConfiguration | undefined): void;
  setPcRole(id: string, role: PcRole): void;
  addPcLog(e: PcLogEntry): void;
  addStats(pcId: string, report: RTCStatsReport, sample: StatsSample): void;
  applyTurn(input: TurnInput): void;
  setLevel(which: "local" | "remote", v: number): void;
  setInterim(text: string): void;
  select(sel: Selection): void;
  clear(): void;
}

export function pushCapped<T>(arr: T[], item: T, cap: number): T[] {
  // ponytail: O(cap) copy per append; fine at a few hundred msgs/s, swap for a real ring buffer if that changes.
  return arr.length >= cap ? [...arr.slice(arr.length - cap + 1), item] : [...arr, item];
}

let nextId = 0;

export function createSessionStore() {
  return createStore<SessionState>()((set) => {
    const updatePc = (id: string, patch: (pc: PcState) => Partial<PcState>) =>
      set((s) => {
        const pc = s.pcs[id];
        return pc ? { pcs: { ...s.pcs, [id]: { ...pc, ...patch(pc) } } } : {};
      });

    return {
      sessionStart: Date.now(),
      events: [],
      dc: [],
      pcs: {},
      turns: [],
      levels: { local: 0, remote: 0 },
      interim: "",
      selection: null,

      addEvent: (name, args, dir) =>
        set((s) => ({ events: pushCapped(s.events, { id: ++nextId, t: Date.now(), name, dir, args }, LOG_CAP) })),
      addDc: (m) => set((s) => ({ dc: pushCapped(s.dc, { ...m, id: ++nextId }, LOG_CAP) })),
      pcCreated: (id, config) =>
        set((s) => ({ pcs: { ...s.pcs, [id]: { id, role: "unknown", createdAt: Date.now(), config, log: [], samples: [], reports: [] } } })),
      setPcRole: (id, role) => updatePc(id, () => ({ role })),
      addPcLog: (e) => updatePc(e.pcId, (pc) => ({ log: pushCapped(pc.log, e, LOG_CAP) })),
      addStats: (pcId, report, sample) =>
        updatePc(pcId, (pc) => ({
          samples: pushCapped(pc.samples, sample, SAMPLE_CAP),
          reports: pushCapped(pc.reports, { t: sample.t, stats: Object.fromEntries(report.entries()) }, SAMPLE_CAP),
        })),
      applyTurn: (input) => set((s) => ({ turns: turnReducer(s.turns, input) })),
      setLevel: (which, v) => set((s) => ({ levels: { ...s.levels, [which]: v } })),
      setInterim: (interim) => set({ interim }),
      select: (selection) => set({ selection }),
      clear: () =>
        set((s) => ({
          sessionStart: Date.now(),
          events: [],
          dc: [],
          turns: [],
          interim: "",
          selection: null,
          pcs: Object.fromEntries(Object.entries(s.pcs).map(([id, pc]) => [id, { ...pc, log: [], samples: [], reports: [] }])),
        })),
    };
  });
}

export const sessionStore = createSessionStore();

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useStore(sessionStore, selector);
}
