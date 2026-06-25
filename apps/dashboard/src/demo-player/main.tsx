import { createRoot } from "react-dom/client";
import { DemoPlayerApp } from "./DemoPlayerApp";
import bakedPayload from "./demo-config.baked.json";
import type { DemoConfigPayload } from "./types";
import "./demo.css";

async function loadDemoPayload(): Promise<DemoConfigPayload> {
  try {
    const response = await fetch("./demo-config.json", { cache: "no-store" });
    if (response.ok) {
      return (await response.json()) as DemoConfigPayload;
    }
  } catch {
    // Local demo-player dev may not have demo-config.json on disk.
  }
  return bakedPayload as DemoConfigPayload;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root mount point.");
}

void loadDemoPayload().then((payload) => {
  createRoot(root).render(<DemoPlayerApp payload={payload} />);
});
