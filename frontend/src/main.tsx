import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/board.css";
import "./styles/panels.css";
import "./styles/print.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
