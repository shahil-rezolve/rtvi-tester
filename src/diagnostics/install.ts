/**
 * Side-effect module, imported FIRST in main.tsx: patches RTCPeerConnection before livekit-client
 * can create one, and starts the 1 Hz stats sampler. Guarded so HMR re-runs don't double-wrap.
 */
import { sessionStore } from "@/store/sessionStore";
import { installPcInterceptor } from "./pcInterceptor";
import { startSampler } from "./stats";

export const livePcs = new Map<string, RTCPeerConnection>();

const g = globalThis as { __rtviTesterInstalled?: boolean };
if (!g.__rtviTesterInstalled) {
  g.__rtviTesterInstalled = true;
  const store = () => sessionStore.getState();

  installPcInterceptor({
    onPcCreated: (id, pc, config) => {
      livePcs.set(id, pc);
      store().pcCreated(id, config);
    },
    onPcRole: (id, role) => store().setPcRole(id, role),
    onLog: (e) => {
      store().addPcLog(e);
      if (e.type === "close") livePcs.delete(e.pcId);
    },
    onDcMessage: (m) => store().addDc(m),
  });

  startSampler(() => livePcs, (pcId, report, sample) => store().addStats(pcId, report, sample));
}
