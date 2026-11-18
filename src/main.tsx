import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, getInitialTheme } from "@/lib/theme";
import "./index.css";

applyTheme(getInitialTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="p-4">RTVI Tester</div>
  </StrictMode>,
);
