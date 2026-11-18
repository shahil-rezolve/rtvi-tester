// Must stay the first import: patches RTCPeerConnection before livekit-client can create one.
import "./diagnostics/install";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyTheme } from "@/lib/theme";
import { usePrefs } from "@/store/prefsStore";
import { App } from "./app/App";
import "./index.css";

applyTheme(usePrefs.getState().theme);
usePrefs.subscribe((s) => applyTheme(s.theme));

if (import.meta.env.DEV) void import("./dev/seed");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
