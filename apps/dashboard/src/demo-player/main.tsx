import { createRoot } from "react-dom/client";
import { DemoPlayerApp } from "./DemoPlayerApp";
import bakedPayload from "./demo-config.baked.json";
import type { DemoConfigPayload } from "./types";
import "./demo.css";

const payload = bakedPayload as DemoConfigPayload;

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root mount point.");
}

createRoot(root).render(<DemoPlayerApp payload={payload} />);
