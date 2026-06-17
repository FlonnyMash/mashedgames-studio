import {
  DEFAULT_GAME_CONFIG,
  normalizeGameConfig,
  type EngineControlAction,
  type GameConfig,
} from "@mashedgames/shared";
import Phaser from "phaser";

export const CATCH_GAME_SCENE_KEY = "catch-game-scene";

export interface CatchGameSceneInitData {
  config?: GameConfig;
}

const TEXTURE_KEYS = {
  player: "player-catcher",
  goodItem: "collectible-good",
  badItem: "collectible-bad",
} as const;

const TEXTURE_CONFIG_FIELDS: Record<
  (typeof TEXTURE_KEYS)[keyof typeof TEXTURE_KEYS],
  keyof GameConfig
> = {
  [TEXTURE_KEYS.player]: "playerCatcherUrl",
  [TEXTURE_KEYS.goodItem]: "collectibleGoodUrl",
  [TEXTURE_KEYS.badItem]: "collectibleBadUrl",
};

const PLAYER_WIDTH = 96;
const PLAYER_HEIGHT = 28;
const ITEM_RADIUS = 18;
const PLAYER_BOTTOM_PADDING = 48;
const HORIZONTAL_PADDING = 24;
const DEFAULT_GOOD_ITEM_POINTS = 10;
const DEFAULT_BAD_ITEM_PENALTY = 5;
const DEFAULT_GOOD_SPAWN_INTERVAL_MS = 900;
const DEFAULT_GOOD_MIN_SPAWN_INTERVAL_MS = 420;
const DEFAULT_GOOD_FALL_SPEED_START = 150;
const DEFAULT_GOOD_FALL_SPEED_MAX = 280;
const DEFAULT_BAD_SPAWN_INTERVAL_MS = 1800;
const DEFAULT_BAD_MIN_SPAWN_INTERVAL_MS = 900;
const DEFAULT_BAD_FALL_SPEED_START = 130;
const DEFAULT_BAD_FALL_SPEED_MAX = 260;
const TIMER_EMIT_INTERVAL_MS = 250;

interface GoodItemTuning {
  points: number;
  spawnIntervalMs: number;
  minSpawnIntervalMs: number;
  fallSpeedStart: number;
  fallSpeedMax: number;
}

interface BadItemTuning {
  penalty: number;
  spawnIntervalMs: number;
  minSpawnIntervalMs: number;
  fallSpeedStart: number;
  fallSpeedMax: number;
}

type GamePhase = "idle" | "playing" | "ended";

interface FallingItemSprite extends Phaser.Physics.Arcade.Sprite {
  isBad?: boolean;
}

export class CatchGameScene extends Phaser.Scene {
  private runtimeConfig: GameConfig = { ...DEFAULT_GAME_CONFIG };
  private phase: GamePhase = "idle";
  private score = 0;
  private elapsedMs = 0;
  private goodSpawnAccumulatorMs = 0;
  private goodSpawnIntervalMs = DEFAULT_GOOD_SPAWN_INTERVAL_MS;
  private goodFallSpeed = DEFAULT_GOOD_FALL_SPEED_START;
  private badSpawnAccumulatorMs = 0;
  private badSpawnIntervalMs = DEFAULT_BAD_SPAWN_INTERVAL_MS;
  private badFallSpeed = DEFAULT_BAD_FALL_SPEED_START;
  private lastTimerEmitMs = 0;

  private player!: Phaser.Physics.Arcade.Image;
  private items!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private boundConfigHandler = (config: GameConfig): void => {
    this.applyConfig(config);
  };

  private boundGameStartHandler = (): void => {
    this.startGame();
  };

  private boundControlHandler = (action: EngineControlAction): void => {
    if (action === "START_GAME") {
      this.startGame();
      return;
    }
    if (action === "RESET_GAME") {
      this.resetGame();
    }
  };

  private boundWindowGameStartHandler = (): void => {
    this.startGame();
  };

  private boundLifecycleBridgeReadyHandler = (): void => {
    this.emitTimerUpdate();
    this.emitLifecycle("score-update", { score: this.score, delta: 0 });
  };

  private boundTextureAddHandler = (key: string): void => {
    this.applySpriteTexture(key);
  };

  private hasCustomAsset(
    config: GameConfig,
    field: keyof GameConfig,
  ): boolean {
    const value = config[field];
    return typeof value === "string" && value.trim().length > 0;
  }

  private applyConfiguredSprites(): void {
    for (const textureKey of Object.values(TEXTURE_KEYS)) {
      if (this.textures.exists(textureKey)) {
        this.applySpriteTexture(textureKey);
      }
    }
  }

  private applySpriteTexture(textureKey: string): void {
    if (textureKey === TEXTURE_KEYS.player && this.player) {
      this.player.setTexture(textureKey);
      this.player.setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT);
      this.player.body?.updateFromGameObject();
      this.layoutWorld(false);
      return;
    }

    if (textureKey !== TEXTURE_KEYS.goodItem && textureKey !== TEXTURE_KEYS.badItem) {
      return;
    }

    for (const child of this.items.getChildren()) {
      const item = child as FallingItemSprite;
      if (!item.active) {
        continue;
      }
      const expectedKey = item.isBad ? TEXTURE_KEYS.badItem : TEXTURE_KEYS.goodItem;
      if (expectedKey === textureKey) {
        item.setTexture(textureKey);
        this.applyCollectibleAppearance(item, Boolean(item.isBad));
      }
    }
  }

  private emitLifecycle(event: string, data: Record<string, unknown>): void {
    this.events.emit(event, data);
    this.game.events.emit(event, data);
  }

  constructor() {
    super({ key: CATCH_GAME_SCENE_KEY });
  }

  preload(): void {
    // Procedural textures are generated in create() so the scene works without assets.
  }

  create(data?: CatchGameSceneInitData): void {
    this.createTextures();
    this.items = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Sprite,
      maxSize: 48,
      runChildUpdate: false,
    });

    this.player = this.physics.add
      .image(0, 0, TEXTURE_KEYS.player)
      .setDepth(2)
      .setImmovable(true);

    this.player.body?.setSize(PLAYER_WIDTH * 0.88, PLAYER_HEIGHT * 0.72, true);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    this.registerInput();
    this.registerBridgeListeners();
    this.physics.add.overlap(
      this.player,
      this.items,
      this.handleOverlap,
      undefined,
      this,
    );
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutWorld, this);
    this.textures.on(Phaser.Textures.Events.ADD, this.boundTextureAddHandler);

    if (data?.config) {
      this.applyConfig(data.config);
    } else {
      void this.loadStandaloneConfig();
    }

    this.layoutWorld();
    this.resetRoundState(false);
    this.emitLifecycle("game-ready", { timestamp: Date.now() });

    if (this.runtimeConfig.showStartScreen === false) {
      this.startGame();
    }
  }

  update(_time: number, delta: number): void {
    if (this.phase !== "playing") {
      return;
    }

    this.elapsedMs += delta;
    this.updatePlayerMovement(delta);
    this.updateSpawner(delta);
    this.updateFallingItems();
    this.emitTimerIfNeeded();
    this.checkTimeExpired();
  }

  applyConfig(config: GameConfig): void {
    const wasPlaying = this.phase === "playing";
    const previousPlayerX = this.player?.x;
    const previousConfig = this.runtimeConfig;
    const themeChanged = config.themeColor !== previousConfig.themeColor;

    for (const [textureKey, configField] of Object.entries(TEXTURE_CONFIG_FIELDS)) {
      const hadCustom = this.hasCustomAsset(previousConfig, configField);
      const hasCustom = this.hasCustomAsset(config, configField);
      if (hadCustom && !hasCustom) {
        this.recreateProceduralTexture(textureKey);
      }
    }

    this.runtimeConfig = config;
    this.cameras.main.setBackgroundColor(config.backgroundColor);

    if (this.player) {
      this.layoutWorld(!wasPlaying);

      if (wasPlaying && previousPlayerX !== undefined) {
        const { width } = this.scale;
        const halfPlayer = PLAYER_WIDTH / 2;
        const minX = HORIZONTAL_PADDING + halfPlayer;
        const maxX = width - HORIZONTAL_PADDING - halfPlayer;
        this.player.x = Phaser.Math.Clamp(previousPlayerX, minX, maxX);
        this.player.body?.updateFromGameObject();
      }
    }

    if (themeChanged) {
      if (wasPlaying) {
        this.refreshActiveCollectibleTints();
      } else {
        this.recreateProceduralTextures();
      }
    }

    this.applyConfiguredSprites();

    if (wasPlaying) {
      const good = this.getGoodTuning();
      const bad = this.getBadTuning();
      this.goodSpawnIntervalMs = Phaser.Math.Clamp(
        this.goodSpawnIntervalMs,
        good.minSpawnIntervalMs,
        good.spawnIntervalMs,
      );
      this.badSpawnIntervalMs = Phaser.Math.Clamp(
        this.badSpawnIntervalMs,
        bad.minSpawnIntervalMs,
        bad.spawnIntervalMs,
      );
      this.emitTimerUpdate();
      return;
    }

    this.emitTimerUpdate();

    if (config.showStartScreen === false && this.phase !== "playing") {
      this.startGame();
    }
  }

  shutdown(): void {
    this.textures.off(Phaser.Textures.Events.ADD, this.boundTextureAddHandler);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutWorld, this);
    this.game.events.off("bridge:config-update", this.boundConfigHandler);
    this.game.events.off("game-start", this.boundGameStartHandler);
    this.game.events.off("bridge:control", this.boundControlHandler);
    this.game.events.off(
      "lifecycle-bridge-ready",
      this.boundLifecycleBridgeReadyHandler,
    );
    window.removeEventListener("GAME_START", this.boundWindowGameStartHandler);
    window.removeEventListener(
      "ENGINE_START_GAME",
      this.boundWindowGameStartHandler,
    );
    this.input.off("pointermove", this.handlePointerMove, this);
    this.input.off("pointerdown", this.handlePointerDown, this);
    this.input.off("pointerup", this.handlePointerUp, this);
  }

  private async loadStandaloneConfig(): Promise<void> {
    if (window.parent !== window) {
      this.applyConfig(this.runtimeConfig);
      return;
    }

    try {
      const response = await fetch("./config.json");
      if (!response.ok) {
        this.applyConfig(this.runtimeConfig);
        return;
      }
      const data: unknown = await response.json();
      this.applyConfig(normalizeGameConfig(data, this.runtimeConfig));
    } catch {
      this.applyConfig(this.runtimeConfig);
    }
  }

  private registerBridgeListeners(): void {
    this.game.events.on("bridge:config-update", this.boundConfigHandler);
    this.game.events.on("game-start", this.boundGameStartHandler);
    this.game.events.on("bridge:control", this.boundControlHandler);
    this.game.events.on(
      "lifecycle-bridge-ready",
      this.boundLifecycleBridgeReadyHandler,
    );
    window.addEventListener("GAME_START", this.boundWindowGameStartHandler);
    window.addEventListener("ENGINE_START_GAME", this.boundWindowGameStartHandler);
  }

  private registerInput(): void {
    this.input.on("pointermove", this.handlePointerMove, this);
    this.input.on("pointerdown", this.handlePointerDown, this);
    this.input.on("pointerup", this.handlePointerUp, this);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== "playing" || !pointer.isDown) {
      return;
    }
    this.snapPlayerToPointer(pointer);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== "playing") {
      return;
    }
    this.snapPlayerToPointer(pointer);
  }

  private handlePointerUp(): void {
    // Player stays at the last touch position.
  }

  private startGame(): void {
    if (this.phase === "playing") {
      return;
    }

    this.resetRoundState(false);
    this.phase = "playing";
    this.emitLifecycle("game-start", { timestamp: Date.now() });
    this.emitTimerUpdate();
  }

  private resetGame(): void {
    this.clearItems();
    this.resetRoundState(false);
  }

  private getRoundProgress(): number {
    return Phaser.Math.Clamp(
      this.elapsedMs / (this.runtimeConfig.gameDurationSeconds * 1000),
      0,
      1,
    );
  }

  private getGoodTuning(): GoodItemTuning {
    const config = this.runtimeConfig;
    const fallSpeedStart =
      config.fallSpeedStart ?? DEFAULT_GOOD_FALL_SPEED_START;
    const fallSpeedMax = Math.max(
      config.fallSpeedMax ?? DEFAULT_GOOD_FALL_SPEED_MAX,
      fallSpeedStart,
    );
    const spawnIntervalMs =
      config.spawnIntervalMs ?? DEFAULT_GOOD_SPAWN_INTERVAL_MS;
    const minSpawnIntervalMs = Math.min(
      config.minSpawnIntervalMs ?? DEFAULT_GOOD_MIN_SPAWN_INTERVAL_MS,
      spawnIntervalMs,
    );

    return {
      points: Math.max(1, config.goodItemPoints ?? DEFAULT_GOOD_ITEM_POINTS),
      spawnIntervalMs: Math.max(200, spawnIntervalMs),
      minSpawnIntervalMs: Math.max(150, minSpawnIntervalMs),
      fallSpeedStart: Math.max(80, fallSpeedStart),
      fallSpeedMax: Math.max(fallSpeedStart, fallSpeedMax),
    };
  }

  private getBadTuning(): BadItemTuning {
    const config = this.runtimeConfig;
    const fallSpeedStart =
      config.badFallSpeedStart ?? DEFAULT_BAD_FALL_SPEED_START;
    const fallSpeedMax = Math.max(
      config.badFallSpeedMax ?? DEFAULT_BAD_FALL_SPEED_MAX,
      fallSpeedStart,
    );
    const spawnIntervalMs =
      config.badSpawnIntervalMs ?? DEFAULT_BAD_SPAWN_INTERVAL_MS;
    const minSpawnIntervalMs = Math.min(
      config.badMinSpawnIntervalMs ?? DEFAULT_BAD_MIN_SPAWN_INTERVAL_MS,
      spawnIntervalMs,
    );

    return {
      penalty: Math.max(0, config.badItemPenalty ?? DEFAULT_BAD_ITEM_PENALTY),
      spawnIntervalMs: Math.max(200, spawnIntervalMs),
      minSpawnIntervalMs: Math.max(150, minSpawnIntervalMs),
      fallSpeedStart: Math.max(80, fallSpeedStart),
      fallSpeedMax: Math.max(fallSpeedStart, fallSpeedMax),
    };
  }

  private resetRoundState(keepScore: boolean): void {
    const good = this.getGoodTuning();
    const bad = this.getBadTuning();
    this.phase = "idle";
    this.elapsedMs = 0;
    this.goodSpawnAccumulatorMs = 0;
    this.goodSpawnIntervalMs = good.spawnIntervalMs;
    this.goodFallSpeed = good.fallSpeedStart;
    this.badSpawnAccumulatorMs = 0;
    this.badSpawnIntervalMs = bad.spawnIntervalMs;
    this.badFallSpeed = bad.fallSpeedStart;
    this.lastTimerEmitMs = 0;
    if (!keepScore) {
      this.score = 0;
      this.emitLifecycle("score-update", { score: this.score, delta: 0 });
    }
    this.clearItems();
    this.layoutWorld();
    this.emitTimerUpdate();
  }

  private endGame(reason = "time-up"): void {
    if (this.phase === "ended") {
      return;
    }

    this.phase = "ended";
    this.clearItems();
    this.emitLifecycle("game-over", {
      finalScore: this.score,
      reason,
    });
  }

  private checkTimeExpired(): void {
    const durationMs = Math.max(1, this.runtimeConfig.gameDurationSeconds) * 1000;
    if (this.elapsedMs >= durationMs) {
      this.endGame("time-up");
    }
  }

  private updatePlayerMovement(_delta: number): void {
    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      this.snapPlayerToPointer(pointer);
      return;
    }

    const { width } = this.scale;
    const halfPlayer = PLAYER_WIDTH / 2;
    const minX = HORIZONTAL_PADDING + halfPlayer;
    const maxX = width - HORIZONTAL_PADDING - halfPlayer;

    let direction = 0;
    if (this.cursors?.left.isDown) {
      direction -= 1;
    }
    if (this.cursors?.right.isDown) {
      direction += 1;
    }

    if (direction !== 0) {
      this.player.x = Phaser.Math.Clamp(this.player.x + direction * 14, minX, maxX);
      this.player.body?.updateFromGameObject();
    }
  }

  private snapPlayerToPointer(pointer: Phaser.Input.Pointer): void {
    const { width } = this.scale;
    const halfPlayer = PLAYER_WIDTH / 2;
    const minX = HORIZONTAL_PADDING + halfPlayer;
    const maxX = width - HORIZONTAL_PADDING - halfPlayer;

    this.player.x = Phaser.Math.Clamp(pointer.worldX, minX, maxX);
    this.player.body?.updateFromGameObject();
  }

  private updateSpawner(delta: number): void {
    const progress = this.getRoundProgress();
    const good = this.getGoodTuning();
    const bad = this.getBadTuning();

    this.goodSpawnIntervalMs = Phaser.Math.Linear(
      good.spawnIntervalMs,
      good.minSpawnIntervalMs,
      progress,
    );
    this.goodFallSpeed = Phaser.Math.Linear(
      good.fallSpeedStart,
      good.fallSpeedMax,
      progress,
    );
    this.badSpawnIntervalMs = Phaser.Math.Linear(
      bad.spawnIntervalMs,
      bad.minSpawnIntervalMs,
      progress,
    );
    this.badFallSpeed = Phaser.Math.Linear(
      bad.fallSpeedStart,
      bad.fallSpeedMax,
      progress,
    );

    this.goodSpawnAccumulatorMs += delta;
    if (this.goodSpawnAccumulatorMs >= this.goodSpawnIntervalMs) {
      this.goodSpawnAccumulatorMs = 0;
      this.spawnItem(false, this.goodFallSpeed);
    }

    this.badSpawnAccumulatorMs += delta;
    if (this.badSpawnAccumulatorMs >= this.badSpawnIntervalMs) {
      this.badSpawnAccumulatorMs = 0;
      this.spawnItem(true, this.badFallSpeed);
    }
  }

  private spawnItem(isBad: boolean, fallSpeed: number): void {
    const { width } = this.scale;
    const texture = isBad ? TEXTURE_KEYS.badItem : TEXTURE_KEYS.goodItem;
    const x = Phaser.Math.Between(
      HORIZONTAL_PADDING + ITEM_RADIUS,
      Math.max(HORIZONTAL_PADDING + ITEM_RADIUS, width - HORIZONTAL_PADDING - ITEM_RADIUS),
    );

    const item = this.items.get(x, -ITEM_RADIUS, texture) as FallingItemSprite | null;
    if (!item) {
      return;
    }

    item.isBad = isBad;
    item.setActive(true).setVisible(true).setDepth(1);
    item.setTexture(texture);
    this.applyCollectibleAppearance(item, isBad);
    item.setCircle(ITEM_RADIUS * 0.9);
    item.setVelocity(0, fallSpeed);
    item.setAngularVelocity(Phaser.Math.Between(-90, 90));
  }

  private updateFallingItems(): void {
    const { height } = this.scale;

    for (const child of this.items.getChildren()) {
      const item = child as FallingItemSprite;
      if (!item.active) {
        continue;
      }

      if (item.y - ITEM_RADIUS > height + 12) {
        this.recycleItem(item);
      }
    }

  }

  private handleOverlap(_player: unknown, itemObj: unknown): void {
    const item = itemObj as FallingItemSprite;
    if (!item.active) {
      return;
    }
    this.handleCatch(item);
  }

  private handleCatch(item: FallingItemSprite): void {
    const good = this.getGoodTuning();
    const bad = this.getBadTuning();
    const delta = item.isBad ? -bad.penalty : good.points;
    this.score = Math.max(0, this.score + delta);
    this.emitLifecycle("score-update", { score: this.score, delta });
    this.recycleItem(item);
  }

  private recycleItem(item: FallingItemSprite): void {
    item.clearTint();
    item.setActive(false).setVisible(false);
    item.setVelocity(0, 0);
    item.setAngularVelocity(0);
    this.items.killAndHide(item);
  }

  private clearItems(): void {
    for (const child of this.items.getChildren()) {
      const item = child as FallingItemSprite;
      this.recycleItem(item);
    }
  }

  private emitTimerIfNeeded(): void {
    if (this.elapsedMs - this.lastTimerEmitMs < TIMER_EMIT_INTERVAL_MS) {
      return;
    }
    this.lastTimerEmitMs = this.elapsedMs;
    this.emitTimerUpdate();
  }

  private emitTimerUpdate(): void {
    const totalMs = Math.max(1, this.runtimeConfig.gameDurationSeconds) * 1000;
    const elapsed = this.phase === "idle" ? 0 : Math.min(this.elapsedMs, totalMs);
    const remaining = Math.max(0, totalMs - elapsed);
    this.emitLifecycle("timer-update", {
      remaining: remaining / 1000,
      elapsed: elapsed / 1000,
    });
  }

  private layoutWorld(resetPlayerX = true): void {
    const { width, height } = this.scale;
    const playerY = height - PLAYER_BOTTOM_PADDING;
    const playerX = resetPlayerX ? width / 2 : this.player.x;

    this.player.setPosition(playerX, playerY);
    this.player.setDisplaySize(PLAYER_WIDTH, PLAYER_HEIGHT);
    this.player.body?.updateFromGameObject();
  }

  private applyCollectibleAppearance(
    item: FallingItemSprite,
    isBad: boolean,
  ): void {
    item.setDisplaySize(ITEM_RADIUS * 2, ITEM_RADIUS * 2);
    item.clearTint();
    if (isBad) {
      return;
    }

    if (
      this.hasCustomAsset(
        this.runtimeConfig,
        TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.goodItem],
      )
    ) {
      return;
    }

    item.setTint(
      Phaser.Display.Color.HexStringToColor(this.runtimeConfig.themeColor).color,
    );
  }

  private refreshActiveCollectibleTints(): void {
    for (const child of this.items.getChildren()) {
      const item = child as FallingItemSprite;
      if (!item.active) {
        continue;
      }
      this.applyCollectibleAppearance(item, Boolean(item.isBad));
    }
  }

  private recreateProceduralTextures(): void {
    for (const [textureKey, configField] of Object.entries(TEXTURE_CONFIG_FIELDS)) {
      if (this.hasCustomAsset(this.runtimeConfig, configField)) {
        continue;
      }
      this.recreateProceduralTexture(textureKey);
    }
    this.applyConfiguredSprites();
  }

  private recreateProceduralTexture(textureKey: string): void {
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
    }

    const goodBaseColor = Phaser.Display.Color.HexStringToColor("#e2e8f0").color;
    const badColor = Phaser.Display.Color.HexStringToColor("#dc2626").color;
    const playerColor = Phaser.Display.Color.HexStringToColor("#f8fafc").color;

    if (textureKey === TEXTURE_KEYS.player) {
      this.ensureRectTexture(textureKey, PLAYER_WIDTH, PLAYER_HEIGHT, playerColor, 10);
      return;
    }
    if (textureKey === TEXTURE_KEYS.goodItem) {
      this.ensureCircleTexture(textureKey, ITEM_RADIUS, goodBaseColor);
      return;
    }
    if (textureKey === TEXTURE_KEYS.badItem) {
      this.ensureDiamondTexture(textureKey, ITEM_RADIUS, badColor);
    }
  }

  private createTextures(): void {
    const goodBaseColor = Phaser.Display.Color.HexStringToColor("#e2e8f0").color;
    const badColor = Phaser.Display.Color.HexStringToColor("#dc2626").color;
    const playerColor = Phaser.Display.Color.HexStringToColor("#f8fafc").color;

    if (!this.hasCustomAsset(this.runtimeConfig, TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.player])) {
      this.ensureRectTexture(TEXTURE_KEYS.player, PLAYER_WIDTH, PLAYER_HEIGHT, playerColor, 10);
    }
    if (!this.hasCustomAsset(this.runtimeConfig, TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.goodItem])) {
      this.ensureCircleTexture(TEXTURE_KEYS.goodItem, ITEM_RADIUS, goodBaseColor);
    }
    if (!this.hasCustomAsset(this.runtimeConfig, TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.badItem])) {
      this.ensureDiamondTexture(TEXTURE_KEYS.badItem, ITEM_RADIUS, badColor);
    }
  }

  private ensureCircleTexture(key: string, radius: number, color: number): void {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color, 1);
    graphics.fillCircle(radius, radius, radius);
    graphics.lineStyle(2, 0xffffff, 0.35);
    graphics.strokeCircle(radius, radius, radius - 1);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }

  private ensureDiamondTexture(key: string, radius: number, color: number): void {
    if (this.textures.exists(key)) {
      return;
    }

    const size = radius * 2;
    const center = radius;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color, 1);
    graphics.fillTriangle(center, 2, size - 2, center, center, size - 2);
    graphics.fillTriangle(center, 2, 2, center, center, size - 2);
    graphics.lineStyle(2, 0xffffff, 0.55);
    graphics.strokeTriangle(center, 2, size - 2, center, center, size - 2);
    graphics.strokeTriangle(center, 2, 2, center, center, size - 2);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private ensureRectTexture(
    key: string,
    width: number,
    height: number,
    color: number,
    radius: number,
  ): void {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(0, 0, width, height, radius);
    graphics.lineStyle(2, Phaser.Display.Color.ValueToColor(color).lighten(20).color, 0.8);
    graphics.strokeRoundedRect(1, 1, width - 2, height - 2, radius);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
