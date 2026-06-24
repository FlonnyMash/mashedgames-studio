/**
 * Standalone UI — vanilla HTML overlays for direct (non-iframe) deployments.
 *
 * This module is ONLY loaded via dynamic import() when isStandaloneMode() is
 * true. It must never be statically imported from paths that execute in the
 * dashboard iframe context. All overlay panels live inside #ui-layer and are
 * constructed with plain DOM APIs + Tailwind utility classes.
 *
 * Overlay state machine:
 *   StartScreen → (CTA tap) → Playing → (game-over) → GameOver
 *   GameOver → (retry) → Playing
 *   GameOver → (lead submit) → [done]
 */

import type { GameConfig } from "@mashedgames/shared";
import type { Game } from "phaser";

// ─── Internal state ──────────────────────────────────────────────────────────

let _root: HTMLElement | null = null;
let _config: GameConfig | null = null;

let _startPanel: HTMLElement | null = null;
let _hudPanel: HTMLElement | null = null;
let _gameoverPanel: HTMLElement | null = null;

let _scoreDisplay: HTMLElement | null = null;
let _timerDisplay: HTMLElement | null = null;
let _finalScoreDisplay: HTMLElement | null = null;

let _currentScore = 0;
let _finalScore = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

export function initStandaloneUI(
  root: HTMLElement,
  game: Game,
  config: GameConfig,
): void {
  _root = root;
  _config = config;

  buildAllPanels(config);
  bindGameEvents(game);
  showPanel("start");
}

/**
 * Called by applyRuntimeConfig in main.ts when config is updated after the
 * config.json fetch (or any future live update in standalone).
 */
export function updateStandaloneConfig(config: GameConfig): void {
  _config = config;
  if (!_root) return;
  rebuildAllPanels(config);
}

// ─── Panel construction ──────────────────────────────────────────────────────

function buildAllPanels(config: GameConfig): void {
  if (!_root) return;
  _startPanel = buildStartPanel(config);
  _hudPanel = buildHudPanel(config);
  _gameoverPanel = buildGameoverPanel(config);

  _root.appendChild(_startPanel);
  _root.appendChild(_hudPanel);
  _root.appendChild(_gameoverPanel);

  hideAll();
}

function rebuildAllPanels(config: GameConfig): void {
  if (!_root) return;

  _startPanel?.remove();
  _hudPanel?.remove();
  _gameoverPanel?.remove();

  _startPanel = buildStartPanel(config);
  _hudPanel = buildHudPanel(config);
  _gameoverPanel = buildGameoverPanel(config);

  _root.appendChild(_startPanel);
  _root.appendChild(_hudPanel);
  _root.appendChild(_gameoverPanel);

  // Restore whichever panel was visible before the config refresh.
  // We track this via data-visible on the root.
  const active = _root.dataset.activePanel as PanelName | undefined;
  if (active) {
    showPanel(active);
  } else {
    hideAll();
    showPanel("start");
  }
}

// ─── Start Screen ─────────────────────────────────────────────────────────────

function buildStartPanel(config: GameConfig): HTMLElement {
  const panel = el("div", [
    "pointer-events-auto",
    "absolute",
    "inset-0",
    "z-20",
    "flex",
    "flex-col",
    "items-center",
    "justify-center",
    "gap-6",
    "px-6",
    "text-center",
  ]);
  panel.id = "standalone-start";

  // Semi-transparent backdrop so the Phaser canvas shows through subtly
  panel.style.background =
    "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)";

  // Logo
  if (config.logoUrl) {
    const logo = el("img", ["max-h-20", "object-contain", "mb-2"]) as HTMLImageElement;
    logo.src = config.logoUrl;
    logo.alt = "Logo";
    panel.appendChild(logo);
  }

  // Title
  const title = el("h1", ["text-4xl", "font-bold", "leading-tight", "drop-shadow-lg"]);
  applyTextStyle(title, {
    color: config.startScreenTitleColor ?? "#ffffff",
    bold: config.startScreenTitleBold,
    italic: config.startScreenTitleItalic,
    underline: config.startScreenTitleUnderline,
  });
  title.textContent = config.startScreenTitle;
  panel.appendChild(title);

  // Subtitle
  if (config.startScreenSubtitle) {
    const subtitle = el("p", ["text-base", "opacity-80", "max-w-xs"]);
    applyTextStyle(subtitle, {
      color: config.startScreenSubtitleColor ?? "#ffffff",
      bold: config.startScreenSubtitleBold,
      italic: config.startScreenSubtitleItalic,
      underline: config.startScreenSubtitleUnderline,
    });
    subtitle.textContent = config.startScreenSubtitle;
    panel.appendChild(subtitle);
  }

  // CTA button
  const cta = el("button", [
    "mt-4",
    "px-10",
    "py-4",
    "rounded-2xl",
    "text-lg",
    "font-semibold",
    "shadow-xl",
    "active:scale-95",
    "transition-transform",
    "cursor-pointer",
    "border-0",
    "outline-none",
  ]) as HTMLButtonElement;
  applyTextStyle(cta, {
    color: config.ctaTextColor ?? "#1e293b",
    bold: config.ctaLabelBold,
    italic: config.ctaLabelItalic,
    underline: config.ctaLabelUnderline,
  });
  cta.style.backgroundColor = config.themeColor;
  cta.textContent = config.ctaLabel;

  cta.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("GAME_START"));
    showPanel("hud");
  });

  panel.appendChild(cta);
  return panel;
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function buildHudPanel(config: GameConfig): HTMLElement {
  const panel = el("div", [
    "pointer-events-none",
    "absolute",
    "inset-x-0",
    "top-0",
    "z-20",
    "flex",
    "items-center",
    "justify-between",
    "px-4",
    "pt-4",
    "pb-2",
  ]);
  panel.id = "standalone-hud";
  panel.style.background =
    "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)";

  // Score
  if (config.showHighscore !== false) {
    const scoreWrap = el("div", ["flex", "flex-col", "items-start"]);
    const scoreLabel = el("span", ["text-xs", "text-white/60", "uppercase", "tracking-widest"]);
    scoreLabel.textContent = "Score";
    _scoreDisplay = el("span", ["text-2xl", "font-bold", "text-white", "tabular-nums"]);
    _scoreDisplay.textContent = "0";
    scoreWrap.appendChild(scoreLabel);
    scoreWrap.appendChild(_scoreDisplay);
    panel.appendChild(scoreWrap);
  }

  // Timer
  if (config.showCountdownTimer !== false) {
    const timerWrap = el("div", ["flex", "flex-col", "items-end"]);
    const timerLabel = el("span", ["text-xs", "text-white/60", "uppercase", "tracking-widest"]);
    timerLabel.textContent = "Time";
    _timerDisplay = el("span", ["text-2xl", "font-bold", "tabular-nums"]);
    _timerDisplay.style.color = config.themeColor;
    _timerDisplay.textContent = String(config.gameDurationSeconds);
    timerWrap.appendChild(timerLabel);
    timerWrap.appendChild(_timerDisplay);
    panel.appendChild(timerWrap);
  }

  return panel;
}

// ─── Game Over / Lead Capture ─────────────────────────────────────────────────

function buildGameoverPanel(config: GameConfig): HTMLElement {
  const panel = el("div", [
    "pointer-events-auto",
    "absolute",
    "inset-0",
    "z-20",
    "flex",
    "flex-col",
    "items-center",
    "justify-center",
    "gap-5",
    "px-6",
    "text-center",
    "overflow-y-auto",
  ]);
  panel.id = "standalone-gameover";
  panel.style.background =
    "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.9) 100%)";

  // Title
  const title = el("h2", ["text-3xl", "font-bold", "leading-tight"]);
  applyTextStyle(title, {
    color: config.leadCaptureTitleColor ?? "#ffffff",
    bold: config.leadCaptureTitleBold,
    italic: config.leadCaptureTitleItalic,
    underline: config.leadCaptureTitleUnderline,
  });
  title.textContent = config.leadCaptureTitle ?? "Great run!";
  panel.appendChild(title);

  // Final score display
  _finalScoreDisplay = el("div", ["text-5xl", "font-black", "tabular-nums"]);
  _finalScoreDisplay.style.color = config.themeColor;
  _finalScoreDisplay.textContent = "0";
  panel.appendChild(_finalScoreDisplay);

  // Subtitle
  if (config.leadCaptureSubtitle) {
    const subtitle = el("p", ["text-sm", "max-w-xs", "opacity-80"]);
    applyTextStyle(subtitle, {
      color: config.leadCaptureSubtitleColor ?? "#a1a1aa",
      bold: config.leadCaptureSubtitleBold,
      italic: config.leadCaptureSubtitleItalic,
      underline: config.leadCaptureSubtitleUnderline,
    });
    subtitle.textContent = config.leadCaptureSubtitle;
    panel.appendChild(subtitle);
  }

  // Lead capture form
  if (config.showLeadCapture !== false) {
    const form = buildLeadCaptureForm(config);
    panel.appendChild(form);
  }

  // Retry button (always shown)
  const retry = el("button", [
    "mt-2",
    "px-8",
    "py-3",
    "rounded-2xl",
    "text-base",
    "font-semibold",
    "shadow-lg",
    "active:scale-95",
    "transition-transform",
    "cursor-pointer",
    "border-0",
    "outline-none",
    "bg-white/10",
  ]) as HTMLButtonElement;
  applyTextStyle(retry, {
    color: config.leadCaptureRetryColor ?? "#1e293b",
    bold: config.leadCaptureRetryBold,
    italic: config.leadCaptureRetryItalic,
    underline: config.leadCaptureRetryUnderline,
  });
  retry.textContent = config.leadCaptureRetryLabel ?? "Try again";

  retry.addEventListener("click", () => {
    _currentScore = 0;
    if (_scoreDisplay) _scoreDisplay.textContent = "0";
    if (_timerDisplay) _timerDisplay.textContent = String(_config?.gameDurationSeconds ?? 60);
    showPanel("hud");
    window.dispatchEvent(new CustomEvent("GAME_START"));
  });

  panel.appendChild(retry);
  return panel;
}

function buildLeadCaptureForm(config: GameConfig): HTMLElement {
  const form = el("form", ["flex", "flex-col", "gap-3", "w-full", "max-w-xs"]) as HTMLFormElement;

  const inputClasses = [
    "w-full",
    "rounded-xl",
    "px-4",
    "py-3",
    "text-sm",
    "bg-white/10",
    "text-white",
    "placeholder-white/40",
    "border",
    "border-white/20",
    "outline-none",
    "focus:ring-2",
  ];

  const nameInput = el("input", inputClasses) as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = config.leadCaptureNamePlaceholder ?? "Your name";
  nameInput.autocomplete = "name";

  const emailInput = el("input", inputClasses) as HTMLInputElement;
  emailInput.type = "email";
  emailInput.placeholder = config.leadCaptureEmailPlaceholder ?? "Email address";
  emailInput.autocomplete = "email";

  const submit = el("button", [
    "w-full",
    "py-3",
    "rounded-2xl",
    "text-base",
    "font-semibold",
    "shadow-lg",
    "active:scale-95",
    "transition-transform",
    "cursor-pointer",
    "border-0",
    "outline-none",
  ]) as HTMLButtonElement;
  submit.type = "submit";
  applyTextStyle(submit, {
    color: config.leadCaptureSubmitColor ?? "#ffffff",
    bold: config.leadCaptureSubmitBold,
    italic: config.leadCaptureSubmitItalic,
    underline: config.leadCaptureSubmitUnderline,
  });
  submit.style.backgroundColor = config.themeColor;
  submit.textContent = config.leadCaptureSubmitLabel ?? "Submit";

  form.appendChild(nameInput);
  form.appendChild(emailInput);
  form.appendChild(submit);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // Emit a DOM event with the lead data so integrators can hook in
    window.dispatchEvent(
      new CustomEvent("standalone:lead-captured", {
        detail: {
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          score: _finalScore,
        },
      }),
    );
    // Show a confirmation message in place of the form
    form.innerHTML = "";
    const thanks = el("p", ["text-center", "text-white/80", "text-sm", "py-2"]);
    thanks.textContent = "Thanks! Your score has been saved.";
    form.appendChild(thanks);
  });

  return form;
}

// ─── Game event bindings ─────────────────────────────────────────────────────

function bindGameEvents(game: Game): void {
  game.events.on("score-update", (data: { score: number }) => {
    _currentScore = data.score;
    if (_scoreDisplay) {
      _scoreDisplay.textContent = String(data.score);
    }
  });

  game.events.on("timer-update", (data: { remaining: number }) => {
    if (_timerDisplay) {
      _timerDisplay.textContent = String(Math.ceil(data.remaining));
    }
  });

  game.events.on("game-over", (data: { finalScore: number }) => {
    _finalScore = data.finalScore ?? _currentScore;
    if (_finalScoreDisplay) {
      _finalScoreDisplay.textContent = String(_finalScore);
    }
    showPanel("gameover");
  });
}

// ─── Panel visibility helpers ────────────────────────────────────────────────

type PanelName = "start" | "hud" | "gameover";

function hideAll(): void {
  setVisible(_startPanel, false);
  setVisible(_hudPanel, false);
  setVisible(_gameoverPanel, false);
}

function showPanel(name: PanelName): void {
  hideAll();
  if (_root) _root.dataset.activePanel = name;
  switch (name) {
    case "start":
      setVisible(_startPanel, true);
      break;
    case "hud":
      setVisible(_hudPanel, true);
      break;
    case "gameover":
      setVisible(_gameoverPanel, true);
      break;
  }
}

function setVisible(panel: HTMLElement | null, visible: boolean): void {
  if (!panel) return;
  panel.style.display = visible ? "" : "none";
}

// ─── DOM & style utilities ───────────────────────────────────────────────────

function el(tag: string, classes: string[]): HTMLElement {
  const node = document.createElement(tag);
  if (classes.length > 0) {
    node.className = classes.join(" ");
  }
  return node;
}

function applyTextStyle(
  node: HTMLElement,
  opts: {
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  },
): void {
  if (opts.color) node.style.color = opts.color;
  if (opts.bold) node.style.fontWeight = "700";
  if (opts.italic) node.style.fontStyle = "italic";
  if (opts.underline) node.style.textDecoration = "underline";
}
