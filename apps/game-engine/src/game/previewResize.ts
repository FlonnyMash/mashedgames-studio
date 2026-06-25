import type Phaser from "phaser";

type ScaleWithResize = Phaser.Scale.ScaleManager & {
  resize?: (width: number, height: number) => void;
  refresh?: () => void;
};

function readParentSize(): { width: number; height: number } | null {
  const parent = document.getElementById("game-container");
  if (!parent) return null;

  const width = Math.max(1, Math.floor(parent.clientWidth));
  const height = Math.max(1, Math.floor(parent.clientHeight));
  if (width < 1 || height < 1) return null;

  return { width, height };
}

function applyGameSize(game: Phaser.Game): void {
  if (!readParentSize()) return;

  const scale = game.scale as ScaleWithResize;
  // FIT mode letterboxes from the fixed 360×640 game size — refresh recalculates
  // the canvas when the iframe or standalone container resizes.
  if (typeof scale.refresh === "function") {
    scale.refresh();
    return;
  }

  const size = readParentSize();
  if (!size) return;

  if (typeof scale.resize === "function") {
    scale.resize(size.width, size.height);
    return;
  }

  window.dispatchEvent(new Event("resize"));
}

/**
 * Keeps Phaser in sync when the engine runs inside the dashboard device iframe.
 * Without this, Scale.RESIZE often leaves a 0×0 canvas (black screen in the phone mockup).
 */
export function bindGamePreviewResize(game: Phaser.Game): () => void {
  const parent = document.getElementById("game-container");
  if (!parent) {
    return () => undefined;
  }

  const apply = () => applyGameSize(game);

  const observer = new ResizeObserver(apply);
  observer.observe(parent);
  window.addEventListener("resize", apply);

  apply();
  requestAnimationFrame(apply);
  requestAnimationFrame(() => requestAnimationFrame(apply));

  const delayed = window.setTimeout(apply, 150);

  return () => {
    window.clearTimeout(delayed);
    observer.disconnect();
    window.removeEventListener("resize", apply);
  };
}
