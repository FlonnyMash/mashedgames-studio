import {
  DEFAULT_GAME_CONFIG,
  isProjectRelativeAssetPath,
  normalizeGameConfig,
  resolveStudioAssetUrl,
  type EngineControlAction,
  type GameConfig,
} from "@mashedgames/shared";
import Phaser from "phaser";

export const LUCKY_WHEEL_SCENE_KEY = "lucky-wheel-scene";

export interface LuckyWheelSceneInitData {
  config?: GameConfig;
}

const TEXTURE_KEYS = {
  pointer: "wheel-pointer",
  center: "wheel-center",
  rim: "wheel-rim",
  confetti: "wheel-confetti",
} as const;

const LOGO_TEXTURE_KEY = "logo";

const TEXTURE_CONFIG_FIELDS: Record<string, string> = {
  [TEXTURE_KEYS.pointer]: "pointerUrl",
  [TEXTURE_KEYS.center]: "centerButtonUrl",
  [TEXTURE_KEYS.rim]: "wheelRimUrl",
};

const MIN_SEGMENTS = 4;
const MAX_SEGMENTS = 8;
const DEFAULT_SEGMENT_COUNT = 8;
const DEFAULT_SEGMENT_LABELS =
  "10% Off|Free Shipping|Try Again|20% Off|Free Gift|5% Off|Grand Prize|Try Again";
const DEFAULT_SEGMENT_WEIGHTS = "20|20|20|10|10|10|5|5";
const DEFAULT_SEGMENT_POINTS = "10|10|0|20|15|5|100|0";
const DEFAULT_SPIN_DURATION_MS = 4500;
const DEFAULT_MIN_FULL_ROTATIONS = 4;
const DEFAULT_WHEEL_RADIUS_PERCENT = 38;
const DEFAULT_LABEL_FONT_SIZE_PERCENT = 11;
const DEFAULT_LABEL_TEXT_COLOR = "#ffffff";
const DEFAULT_LOGO_SIZE_PERCENT = 42;
const LOGO_BAND_TOP_PADDING = 8;
const DEFAULT_SPIN_BUTTON_LABEL = "Spin";
const DEFAULT_SPIN_BUTTON_TEXT_COLOR = "#ffffff";
const DEFAULT_SPIN_BUTTON_BORDER_COLOR = "#ffffff";
const DEFAULT_SPIN_BUTTON_FONT_SIZE_PERCENT = 42;
const DEFAULT_SPIN_BUTTON_WIDTH_PERCENT = 115;
const SEGMENT_BOUNDARY_MARGIN_PERCENT = 0.15;
const CONFETTI_COLORS = [
  0xf87171, 0xfacc15, 0x4ade80, 0x60a5fa, 0xc084fc, 0xf472b6,
];

interface SegmentDatum {
  label: string;
  weight: number;
  points: number;
}

interface DragSample {
  angle: number;
  time: number;
}

type SpinOptions = {
  direction?: 1 | -1;
  extraRotations?: number;
};

type GamePhase = "idle" | "ready" | "dragging" | "spinning" | "ended";

export class LuckyWheelScene extends Phaser.Scene {
  private runtimeConfig: GameConfig = { ...DEFAULT_GAME_CONFIG };
  private phase: GamePhase = "idle";
  private segments: SegmentDatum[] = [];
  private accumulatedAngle = 0;

  private centerX = 0;
  private centerY = 0;
  private currentRadius = 0;
  private pointerTickBucket = 0;
  private pointerDeflectDirection = 1;
  private activeSpinDirection: 1 | -1 = 1;
  private lastWheelAngleSample = 0;

  private dragActive = false;
  private dragSamples: DragSample[] = [];

  private wheelGraphics!: Phaser.GameObjects.Graphics;
  private wheelContainer!: Phaser.GameObjects.Container;
  private segmentLabelTexts: Phaser.GameObjects.Text[] = [];
  private rimImage!: Phaser.GameObjects.Image;
  private pointerImage!: Phaser.GameObjects.Image;
  private spinButtonContainer!: Phaser.GameObjects.Container;
  private spinButtonBg!: Phaser.GameObjects.Image;
  private spinButtonLabel!: Phaser.GameObjects.Text;
  private logoImage: Phaser.GameObjects.Image | null = null;
  private logoFloatTween?: Phaser.Tweens.Tween;
  private spinButtonPulseTween?: Phaser.Tweens.Tween;
  private logoAnchorY = 0;
  private loadedLogoUrl = "";
  private logoObjectUrl: string | null = null;
  private logoLoadGeneration = 0;
  private boundLogoLoadComplete = (): void => {
    if (this.textures.exists(LOGO_TEXTURE_KEY)) {
      this.applyLogoTexture();
      if (this.wheelContainer) {
        this.layoutWorld();
      }
    }
  };

  private boundLogoLoadError = (file: Phaser.Loader.File): void => {
    if (file.key !== LOGO_TEXTURE_KEY || !this.hasLogoConfigured()) {
      return;
    }

    this.time.delayedCall(80, () => {
      if (!this.textures.exists(LOGO_TEXTURE_KEY) && this.hasLogoConfigured()) {
        void this.ensureLogoLoaded();
      }
    });
  };

  private boundConfigHandler = (config: GameConfig): void => {
    this.applyConfig(config);
  };

  private boundGameStartHandler = (): void => {
    this.startSpin();
  };

  private boundControlHandler = (action: EngineControlAction): void => {
    if (action === "START_GAME") {
      this.startSpin();
      return;
    }
    if (action === "RESET_GAME") {
      this.resetGame();
    }
  };

  private boundWindowGameStartHandler = (): void => {
    this.startSpin();
  };

  private boundLifecycleBridgeReadyHandler = (): void => {
    this.emitLifecycle("score-update", { score: 0, delta: 0 });
  };

  private boundTextureAddHandler = (key: string): void => {
    this.applySpriteTexture(key);
    if (
      key === LOGO_TEXTURE_KEY ||
      (Object.values(TEXTURE_KEYS) as string[]).includes(key)
    ) {
      this.layoutWorld();
    }
  };

  private boundSpinButtonTapHandler = (): void => {
    this.startSpin();
  };

  private boundSpinButtonOverHandler = (): void => {
    if (this.phase !== "ready") {
      return;
    }
    this.tweens.add({
      targets: this.spinButtonContainer,
      scale: 1.05,
      duration: 120,
      ease: "Sine.easeOut",
    });
  };

  private boundSpinButtonOutHandler = (): void => {
    if (this.phase !== "ready") {
      return;
    }
    this.tweens.add({
      targets: this.spinButtonContainer,
      scale: 1,
      duration: 120,
      ease: "Sine.easeOut",
    });
  };

  private handleWheelPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.phase !== "ready") {
      return;
    }
    const dx = pointer.x - this.centerX;
    const dy = pointer.y - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.currentRadius * 1.15 || distance < 6) {
      return;
    }

    this.tweens.killTweensOf(this.wheelContainer);
    this.dragActive = true;
    this.dragSamples = [{ angle: this.angleToPointer(pointer), time: this.time.now }];
    this.pointerTickBucket = this.currentSegmentBucket(this.accumulatedAngle);
    this.phase = "dragging";
  };

  private handleWheelPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragActive) {
      return;
    }
    if (!pointer.isDown) {
      this.finalizeDrag();
      return;
    }

    const angle = this.angleToPointer(pointer);
    const last = this.dragSamples[this.dragSamples.length - 1];
    const delta = Phaser.Math.Angle.WrapDegrees(angle - last.angle);
    this.accumulatedAngle += delta;
    this.wheelContainer.setAngle(this.accumulatedAngle);
    this.maybeTickPointer(this.accumulatedAngle);

    const now = this.time.now;
    this.dragSamples.push({ angle, time: now });
    const cutoff = now - 120;
    while (this.dragSamples.length > 2 && this.dragSamples[0].time < cutoff) {
      this.dragSamples.shift();
    }
  };

  private handleWheelPointerUp = (): void => {
    this.finalizeDrag();
  };

  private hasCustomAsset(config: GameConfig, field: string): boolean {
    const value = config.fields?.[field];
    return typeof value === "string" && value.trim().length > 0;
  }

  private numberField(config: GameConfig, key: string, fallback: number): number {
    const value = config.fields?.[key];
    return typeof value === "number" ? value : fallback;
  }

  private stringField(config: GameConfig, key: string, fallback: string): string {
    const value = config.fields?.[key];
    return typeof value === "string" && value.trim().length > 0 ? value : fallback;
  }

  private hasLogoConfigured(config: GameConfig = this.runtimeConfig): boolean {
    return typeof config.logoUrl === "string" && config.logoUrl.trim().length > 0;
  }

  private booleanField(config: GameConfig, key: string, fallback: boolean): boolean {
    const value = config.fields?.[key];
    return typeof value === "boolean" ? value : fallback;
  }

  private optionalStringField(
    config: GameConfig,
    key: string,
  ): string | undefined {
    const value = config.fields?.[key];
    return typeof value === "string" ? value : undefined;
  }

  private prizeFieldKey(slot: number, suffix: "Name" | "Weight" | "Value"): string {
    return `prize${slot}${suffix}`;
  }

  private emitLifecycle(event: string, data: Record<string, unknown>): void {
    this.events.emit(event, data);
    this.game.events.emit(event, data);
  }

  constructor() {
    super({ key: LUCKY_WHEEL_SCENE_KEY });
  }

  preload(): void {
    // Procedural textures are generated in create() so the scene works without assets.
  }

  create(data?: LuckyWheelSceneInitData): void {
    this.segments = this.computeSegments(this.runtimeConfig);
    this.createTextures();

    this.wheelGraphics = this.add.graphics();
    this.wheelContainer = this.add.container(0, 0, [this.wheelGraphics]).setDepth(1);
    this.rimImage = this.add.image(0, 0, TEXTURE_KEYS.rim).setDepth(0);
    this.pointerImage = this.add
      .image(0, 0, TEXTURE_KEYS.pointer)
      .setDepth(3)
      .setOrigin(0.5, 0);
    this.spinButtonBg = this.add.image(0, 0, TEXTURE_KEYS.center);
    this.spinButtonLabel = this.add.text(0, 0, DEFAULT_SPIN_BUTTON_LABEL, {
      fontFamily: "sans-serif",
      fontSize: "22px",
      color: "#ffffff",
      align: "center",
    });
    this.spinButtonLabel.setOrigin(0.5, 0.5);
    this.spinButtonContainer = this.add
      .container(0, 0, [this.spinButtonBg, this.spinButtonLabel])
      .setDepth(2);
    this.spinButtonBg.setInteractive({ useHandCursor: true });
    this.spinButtonBg.on("pointerdown", this.boundSpinButtonTapHandler);
    this.spinButtonBg.on("pointerover", this.boundSpinButtonOverHandler);
    this.spinButtonBg.on("pointerout", this.boundSpinButtonOutHandler);

    this.registerBridgeListeners();
    this.registerWheelInput();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutWorld, this);
    this.textures.on(Phaser.Textures.Events.ADD, this.boundTextureAddHandler);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.boundLogoLoadError);

    if (data?.config) {
      this.applyConfig(data.config);
    } else {
      void this.loadStandaloneConfig();
    }

    this.layoutWorld();
    this.emitLifecycle("game-ready", { timestamp: Date.now() });

    if (this.hasLogoConfigured()) {
      void this.ensureLogoLoaded();
      this.time.delayedCall(200, () => {
        if (!this.textures.exists(LOGO_TEXTURE_KEY)) {
          void this.ensureLogoLoaded();
        }
      });
    }

    if (this.phase === "idle") {
      this.phase = "ready";
      this.startSpinButtonPulse();
    }
  }

  applyConfig(config: GameConfig): void {
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
    this.segments = this.computeSegments(config);
    this.cameras.main.setBackgroundColor(config.backgroundColor);

    const spinButtonAppearanceChanged =
      this.stringField(config, "spinButtonColor", "") !==
        this.stringField(previousConfig, "spinButtonColor", "") ||
      this.stringField(config, "spinButtonHighlightColor", "") !==
        this.stringField(previousConfig, "spinButtonHighlightColor", "") ||
      this.stringField(config, "spinButtonBorderColor", "") !==
        this.stringField(previousConfig, "spinButtonBorderColor", "");

    if (themeChanged && this.phase !== "spinning" && this.phase !== "dragging") {
      this.recreateProceduralTextures();
    } else if (
      spinButtonAppearanceChanged &&
      !this.hasCustomAsset(config, "centerButtonUrl") &&
      this.phase !== "spinning" &&
      this.phase !== "dragging"
    ) {
      this.recreateProceduralTexture(TEXTURE_KEYS.center);
    }

    this.applyConfiguredSprites();
    this.syncLogoAsset(config);
    this.updateSpinButtonStyle();

    if (this.wheelContainer) {
      this.layoutWorld();
    }
  }

  shutdown(): void {
    this.tweens.killTweensOf(this.wheelContainer);
    this.tweens.killTweensOf(this.pointerImage);
    this.tweens.killTweensOf(this.spinButtonContainer);
    this.logoFloatTween?.stop();
    this.spinButtonPulseTween?.stop();
    this.load.off(Phaser.Loader.Events.COMPLETE, this.boundLogoLoadComplete);
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.boundLogoLoadError);
    this.revokeLogoObjectUrl();
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
    this.spinButtonBg?.off("pointerdown", this.boundSpinButtonTapHandler);
    this.spinButtonBg?.off("pointerover", this.boundSpinButtonOverHandler);
    this.spinButtonBg?.off("pointerout", this.boundSpinButtonOutHandler);
    this.input.off("pointerdown", this.handleWheelPointerDown);
    this.input.off("pointermove", this.handleWheelPointerMove);
    this.input.off("pointerup", this.handleWheelPointerUp);
    this.input.off("pointerupoutside", this.handleWheelPointerUp);
  }

  private async loadStandaloneConfig(): Promise<void> {
    if (window.parent !== window) {
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

  private registerWheelInput(): void {
    this.input.on("pointerdown", this.handleWheelPointerDown);
    this.input.on("pointermove", this.handleWheelPointerMove);
    this.input.on("pointerup", this.handleWheelPointerUp);
    this.input.on("pointerupoutside", this.handleWheelPointerUp);
  }

  private angleToPointer(pointer: Phaser.Input.Pointer): number {
    return Phaser.Math.RadToDeg(
      Math.atan2(pointer.y - this.centerY, pointer.x - this.centerX),
    );
  }

  private currentSegmentBucket(angleDeg: number): number {
    const segmentCount = this.segments.length;
    if (segmentCount === 0) {
      return 0;
    }
    const segmentAngle = 360 / segmentCount;
    const normalized = ((angleDeg % 360) + 360) % 360;
    return Math.floor(normalized / segmentAngle);
  }

  private maybeTickPointer(
    angleForBucket: number,
    motionDirection?: 1 | -1,
  ): void {
    const bucket = this.currentSegmentBucket(angleForBucket);
    if (bucket !== this.pointerTickBucket) {
      if (motionDirection !== undefined) {
        this.pointerDeflectDirection = motionDirection;
      } else {
        const delta = angleForBucket - this.lastWheelAngleSample;
        if (Math.abs(delta) > 0.01) {
          this.pointerDeflectDirection = delta >= 0 ? 1 : -1;
        }
      }
      this.lastWheelAngleSample = angleForBucket;
      this.pointerTickBucket = bucket;
      this.tickPointer();
    }
  }

  private tickPointer(): void {
    this.tweens.killTweensOf(this.pointerImage);
    // Flex opposite to wheel motion — peg pushes the pointer back, then it snaps forward.
    const deflect = -22 * this.pointerDeflectDirection;
    this.tweens.add({
      targets: this.pointerImage,
      angle: { from: 0, to: deflect },
      duration: 55,
      ease: "Quad.easeOut",
      yoyo: true,
      onComplete: () => {
        this.pointerImage.setAngle(0);
      },
    });
  }

  private finalizeDrag(): void {
    if (!this.dragActive) {
      return;
    }
    this.dragActive = false;

    const samples = this.dragSamples;
    this.dragSamples = [];

    let velocity = 0;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = Math.max(1, last.time - first.time);
      let totalDelta = 0;
      for (let i = 1; i < samples.length; i += 1) {
        totalDelta += Phaser.Math.Angle.WrapDegrees(
          samples[i].angle - samples[i - 1].angle,
        );
      }
      velocity = totalDelta / elapsed;
    }

    if (this.phase !== "dragging") {
      return;
    }
    this.phase = "ready";

    const direction: 1 | -1 = velocity < -0.02 ? -1 : 1;
    const extraRotations = Phaser.Math.Clamp(Math.round(Math.abs(velocity) * 25), 0, 6);
    this.startSpin({ direction, extraRotations });
  }

  private computeSegments(config: GameConfig): SegmentDatum[] {
    const rawCount = this.numberField(config, "segmentCount", DEFAULT_SEGMENT_COUNT);
    const count = Phaser.Math.Clamp(Math.round(rawCount), MIN_SEGMENTS, MAX_SEGMENTS);

    const legacyLabels = this.stringField(config, "segmentLabels", DEFAULT_SEGMENT_LABELS)
      .split("|")
      .map((value) => value.trim());
    const legacyWeights = this.stringField(config, "segmentWeights", DEFAULT_SEGMENT_WEIGHTS)
      .split("|")
      .map((value) => Number.parseFloat(value.trim()));
    const legacyPoints = this.stringField(config, "segmentPoints", DEFAULT_SEGMENT_POINTS)
      .split("|")
      .map((value) => Number.parseFloat(value.trim()));

    const segments: SegmentDatum[] = [];
    for (let i = 0; i < count; i += 1) {
      const slot = i + 1;
      const configuredName = this.optionalStringField(
        config,
        this.prizeFieldKey(slot, "Name"),
      )?.trim();
      const label =
        configuredName && configuredName.length > 0
          ? configuredName
          : legacyLabels[i]?.length
            ? legacyLabels[i]
            : `Prize ${slot}`;

      const configuredWeight = this.numberField(
        config,
        this.prizeFieldKey(slot, "Weight"),
        Number.NaN,
      );
      const weight =
        Number.isFinite(configuredWeight) && configuredWeight > 0
          ? configuredWeight
          : Number.isFinite(legacyWeights[i]) && legacyWeights[i] > 0
            ? legacyWeights[i]
            : 10;

      const configuredValue = this.numberField(
        config,
        this.prizeFieldKey(slot, "Value"),
        Number.NaN,
      );
      const point = Number.isFinite(configuredValue)
        ? Math.max(0, configuredValue)
        : Number.isFinite(legacyPoints[i])
          ? Math.max(0, legacyPoints[i])
          : 0;

      segments.push({ label, weight, points: point });
    }
    return segments;
  }

  private getRadius(): number {
    const { width, height } = this.scale;
    const minDimension = Math.min(width, height);
    const percent = Phaser.Math.Clamp(
      this.numberField(this.runtimeConfig, "wheelRadiusPercent", DEFAULT_WHEEL_RADIUS_PERCENT),
      15,
      48,
    );
    return Math.max(60, (minDimension * percent) / 100);
  }

  private layoutWorld = (): void => {
    if (!this.wheelContainer) {
      return;
    }

    const { width, height } = this.scale;
    const radius = this.getRadius();
    const rimDiameter = radius * 2.24;
    const spinButtonWidthPercent = Phaser.Math.Clamp(
      this.numberField(
        this.runtimeConfig,
        "spinButtonWidthPercent",
        DEFAULT_SPIN_BUTTON_WIDTH_PERCENT,
      ),
      90,
      150,
    );
    const spinButtonWidth = Phaser.Math.Clamp(
      radius * (spinButtonWidthPercent / 100),
      120,
      260,
    );
    const spinButtonHeight = Phaser.Math.Clamp(radius * 0.3, 46, 58);
    const gap = Math.max(10, radius * 0.14);
    const pointerSize = Phaser.Math.Clamp(radius * 0.24, 30, 64);
    const pointerTop = pointerSize + 8;
    const wantsLogo = this.hasLogoConfigured();
    const logoSizePercent = Phaser.Math.Clamp(
      this.numberField(
        this.runtimeConfig,
        "logoSizePercent",
        DEFAULT_LOGO_SIZE_PERCENT,
      ),
      10,
      100,
    );
    const logoTargetHeight = wantsLogo
      ? Phaser.Math.Clamp(radius * (logoSizePercent / 100), 20, Math.min(height * 0.3, 200))
      : 0;
    const totalHeight = pointerTop + rimDiameter + gap + spinButtonHeight;

    const contentTop = Math.max(8, (height - totalHeight) / 2);
    const centerX = width / 2;
    const centerY = contentTop + pointerTop + rimDiameter / 2;
    const wheelTop = centerY - radius - pointerSize + 6;
    const spinButtonY = centerY + rimDiameter / 2 + gap + spinButtonHeight / 2;

    this.centerX = centerX;
    this.centerY = centerY;
    this.currentRadius = radius;

    this.wheelContainer.setPosition(centerX, centerY);
    this.wheelContainer.setAngle(this.accumulatedAngle);
    this.rimImage.setPosition(centerX, centerY);
    this.rimImage.setDisplaySize(rimDiameter, rimDiameter);

    this.pointerImage.setOrigin(0.5, 0);
    this.pointerImage.setFlipY(false);
    this.pointerImage.setPosition(centerX, centerY - radius - pointerSize + 6);
    this.pointerImage.setDisplaySize(pointerSize, pointerSize);
    this.pointerImage.setAngle(0);

    this.spinButtonContainer.setPosition(centerX, spinButtonY);
    this.spinButtonContainer.setScale(1);
    this.spinButtonBg.setDisplaySize(spinButtonWidth, spinButtonHeight);
    const spinButtonFontPercent = Phaser.Math.Clamp(
      this.numberField(
        this.runtimeConfig,
        "spinButtonFontSizePercent",
        DEFAULT_SPIN_BUTTON_FONT_SIZE_PERCENT,
      ),
      28,
      56,
    );
    this.spinButtonLabel.setFontSize(
      Phaser.Math.Clamp(Math.round(spinButtonHeight * (spinButtonFontPercent / 100)), 14, 32),
    );
    this.spinButtonBg.setInteractive({ useHandCursor: true });

    if (wantsLogo) {
      const logoBandTop = LOGO_BAND_TOP_PADDING;
      const logoBandBottom = wheelTop - Math.max(6, radius * 0.05);
      const logoBandHeight = Math.max(0, logoBandBottom - logoBandTop);

      if (!this.logoImage && this.textures.exists(LOGO_TEXTURE_KEY)) {
        this.applyLogoTexture();
      }

      if (this.logoImage && this.textures.exists(LOGO_TEXTURE_KEY)) {
        this.logoImage.setVisible(true);
        const displayHeight =
          logoBandHeight > 0
            ? Math.min(logoTargetHeight, logoBandHeight)
            : logoTargetHeight;
        this.logoAnchorY = logoBandTop + logoBandHeight / 2;
        this.logoImage.setPosition(centerX, this.logoAnchorY);
        const frame = this.textures.getFrame(LOGO_TEXTURE_KEY);
        const aspect =
          frame.width > 0 && frame.height > 0 ? frame.width / frame.height : 1;
        const logoWidth = Math.min(width * 0.72, Math.max(24, displayHeight * aspect));
        this.logoImage.setDisplaySize(logoWidth, displayHeight);
        this.restartLogoFloat();
      } else if (this.logoImage) {
        this.logoImage.setVisible(false);
        this.logoFloatTween?.stop();
      }
    } else if (this.logoImage) {
      this.logoImage.setVisible(false);
      this.logoFloatTween?.stop();
    }

    this.rebuildWheelVisuals(radius);
  };

  private rebuildWheelVisuals(radius: number): void {
    if (this.phase === "spinning" || this.phase === "dragging" || !this.wheelGraphics) {
      return;
    }

    this.wheelGraphics.clear();
    for (const text of this.segmentLabelTexts) {
      text.destroy();
    }
    this.segmentLabelTexts = [];

    const segmentCount = this.segments.length;
    if (segmentCount === 0) {
      return;
    }

    const segmentAngle = 360 / segmentCount;
    const themeColor = Phaser.Display.Color.HexStringToColor(
      this.runtimeConfig.themeColor,
    ).color;
    const alternateColor = Phaser.Display.Color.ValueToColor(themeColor).lighten(22)
      .color;
    const showLabels = this.booleanField(this.runtimeConfig, "showSegmentLabels", true);
    const fontPercent = Phaser.Math.Clamp(
      this.numberField(
        this.runtimeConfig,
        "labelFontSizePercent",
        DEFAULT_LABEL_FONT_SIZE_PERCENT,
      ),
      6,
      20,
    );
    const labelColor = this.stringField(
      this.runtimeConfig,
      "labelTextColor",
      DEFAULT_LABEL_TEXT_COLOR,
    );
    const labelRadius = radius * 0.66;
    const chordWidth =
      2 * labelRadius * Math.sin(Phaser.Math.DegToRad(segmentAngle) / 2);
    const wrapWidth = Math.max(34, chordWidth * 0.86);
    const fontSize = Phaser.Math.Clamp(Math.round(radius * (fontPercent / 100)), 9, 30);

    for (let i = 0; i < segmentCount; i += 1) {
      const canvasStartAngle = i * segmentAngle - 90;
      const canvasEndAngle = canvasStartAngle + segmentAngle;
      const startRad = Phaser.Math.DegToRad(canvasStartAngle);
      const endRad = Phaser.Math.DegToRad(canvasEndAngle);
      const fillColor = i % 2 === 0 ? themeColor : alternateColor;

      this.wheelGraphics.fillStyle(fillColor, 1);
      this.wheelGraphics.slice(0, 0, radius, startRad, endRad, false);
      this.wheelGraphics.fillPath();

      this.wheelGraphics.lineStyle(2, 0xffffff, 0.45);
      this.wheelGraphics.slice(0, 0, radius, startRad, endRad, false);
      this.wheelGraphics.strokePath();

      if (showLabels) {
        const midCanvasAngle = canvasStartAngle + segmentAngle / 2;
        const midRad = Phaser.Math.DegToRad(midCanvasAngle);
        const label = this.add.text(
          Math.cos(midRad) * labelRadius,
          Math.sin(midRad) * labelRadius,
          this.segments[i].label,
          {
            fontFamily: "sans-serif",
            fontStyle: "600",
            fontSize: `${fontSize}px`,
            color: labelColor,
            align: "center",
            wordWrap: { width: wrapWidth, useAdvancedWrap: true },
            stroke: "#00000080",
            strokeThickness: Math.max(2, Math.round(fontSize * 0.14)),
          },
        );
        label.setOrigin(0.5, 0.5);
        label.setRotation(midRad + Math.PI / 2);
        this.wheelContainer.add(label);
        this.segmentLabelTexts.push(label);
      }
    }

    this.wheelGraphics.lineStyle(4, 0xffffff, 0.75);
    this.wheelGraphics.strokeCircle(0, 0, radius);
  }

  private pickWeightedIndex(): number {
    const totalWeight = this.segments.reduce(
      (sum, segment) => sum + Math.max(0, segment.weight),
      0,
    );
    if (totalWeight <= 0) {
      return Phaser.Math.Between(0, this.segments.length - 1);
    }

    let roll = Math.random() * totalWeight;
    for (let i = 0; i < this.segments.length; i += 1) {
      roll -= Math.max(0, this.segments[i].weight);
      if (roll <= 0) {
        return i;
      }
    }
    return this.segments.length - 1;
  }

  private computeTargetAngle(index: number): number {
    const segmentAngle = 360 / this.segments.length;
    const margin = segmentAngle * SEGMENT_BOUNDARY_MARGIN_PERCENT;
    const low = index * segmentAngle + margin;
    const high = (index + 1) * segmentAngle - margin;
    return Phaser.Math.FloatBetween(low, high);
  }

  private computeFinalAngle(index: number, direction: 1 | -1, minRotations: number): number {
    const targetAngle = this.computeTargetAngle(index);
    const currentMod = ((this.accumulatedAngle % 360) + 360) % 360;
    const desiredMod = ((-targetAngle % 360) + 360) % 360;

    if (direction === -1) {
      const deltaMod = ((currentMod - desiredMod) % 360 + 360) % 360;
      return this.accumulatedAngle - minRotations * 360 - deltaMod;
    }

    const deltaMod = ((desiredMod - currentMod) % 360 + 360) % 360;
    return this.accumulatedAngle + minRotations * 360 + deltaMod;
  }

  private startSpin(options?: SpinOptions): void {
    if (this.phase === "spinning" || this.phase === "dragging") {
      return;
    }
    if (this.segments.length === 0) {
      this.segments = this.computeSegments(this.runtimeConfig);
      this.layoutWorld();
    }
    if (this.segments.length === 0) {
      return;
    }

    const winningIndex = this.pickWeightedIndex();
    const direction = options?.direction ?? 1;
    const configuredMinRotations = Math.max(
      1,
      Math.round(
        this.numberField(this.runtimeConfig, "minFullRotations", DEFAULT_MIN_FULL_ROTATIONS),
      ),
    );
    const minRotations = configuredMinRotations + (options?.extraRotations ?? 0);
    const finalAngle = this.computeFinalAngle(winningIndex, direction, minRotations);
    const duration = Math.max(
      1000,
      this.numberField(this.runtimeConfig, "spinDurationMs", DEFAULT_SPIN_DURATION_MS),
    );

    this.phase = "spinning";
    this.spinButtonPulseTween?.stop();
    this.spinButtonBg.disableInteractive();
    this.activeSpinDirection = direction;
    this.pointerTickBucket = this.currentSegmentBucket(this.accumulatedAngle);
    this.lastWheelAngleSample = this.accumulatedAngle;
    this.emitLifecycle("game-start", { timestamp: Date.now() });

    this.tweens.add({
      targets: this.wheelContainer,
      angle: finalAngle,
      duration,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        this.maybeTickPointer(this.wheelContainer.angle, this.activeSpinDirection);
      },
      onComplete: () => {
        this.accumulatedAngle = finalAngle;
        this.finishSpin(winningIndex);
      },
    });
  }

  private finishSpin(index: number): void {
    const segment = this.segments[index];
    const points = segment?.points ?? 0;
    const label = segment?.label ?? "";

    this.emitLifecycle("score-update", { score: points, delta: points });

    if (points > 0) {
      this.phase = "ended";
      this.playWinFeedback();
      this.emitLifecycle("game-over", { finalScore: points, reason: label });
      return;
    }

    this.playRetryFeedback();
  }

  private playWinFeedback(): void {
    this.spawnConfetti();

    this.tweens.add({
      targets: this.wheelContainer,
      scale: 1.08,
      duration: 180,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.tweens.add({
      targets: this.spinButtonContainer,
      scale: 1.08,
      duration: 180,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  private playRetryFeedback(): void {
    const settledAngle = this.wheelContainer.angle;

    this.tweens.add({
      targets: this.wheelContainer,
      angle: settledAngle - 6,
      duration: 90,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.wheelContainer.setAngle(settledAngle);
        this.phase = "ready";
        this.spinButtonBg.setInteractive({ useHandCursor: true });
        this.startSpinButtonPulse();
      },
    });
  }

  private spawnConfetti(): void {
    const originX = this.wheelContainer.x;
    const originY = this.wheelContainer.y;

    for (let i = 0; i < 26; i += 1) {
      const particle = this.add.image(originX, originY, TEXTURE_KEYS.confetti);
      particle.setTint(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
      particle.setDepth(5);
      particle.setRotation(Math.random() * Math.PI * 2);

      const angle = Math.random() * Math.PI * 2;
      const distance = 60 + Math.random() * 140;
      const targetX = originX + Math.cos(angle) * distance;
      const targetY = originY + Math.sin(angle) * distance * 0.6 - 40 - Math.random() * 60;
      const fallY = targetY + 160 + Math.random() * 120;

      this.tweens.add({
        targets: particle,
        x: targetX,
        y: targetY,
        angle: particle.angle + Phaser.Math.Between(-180, 180),
        duration: 260 + Math.random() * 120,
        ease: "Cubic.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: particle,
            y: fallY,
            alpha: 0,
            angle: particle.angle + Phaser.Math.Between(-90, 90),
            duration: 600 + Math.random() * 300,
            ease: "Sine.easeIn",
            onComplete: () => particle.destroy(),
          });
        },
      });
    }
  }

  private resetGame(): void {
    this.tweens.killTweensOf(this.wheelContainer);
    this.dragActive = false;
    this.dragSamples = [];
    this.accumulatedAngle = ((this.accumulatedAngle % 360) + 360) % 360;
    this.wheelContainer.setAngle(this.accumulatedAngle);
    this.wheelContainer.setScale(1);
    this.phase = "ready";
    this.spinButtonContainer.setScale(1);
    this.spinButtonBg.setInteractive({ useHandCursor: true });
    this.startSpinButtonPulse();
    this.rebuildWheelVisuals(this.getRadius());
    this.emitLifecycle("score-update", { score: 0, delta: 0 });
  }

  private applyConfiguredSprites(): void {
    if (this.textures.exists(LOGO_TEXTURE_KEY)) {
      this.applyLogoTexture();
    }
    for (const textureKey of Object.values(TEXTURE_KEYS)) {
      if (this.textures.exists(textureKey)) {
        this.applySpriteTexture(textureKey);
      }
    }
  }

  private applySpriteTexture(textureKey: string): void {
    if (textureKey === LOGO_TEXTURE_KEY) {
      this.applyLogoTexture();
      return;
    }
    if (textureKey === TEXTURE_KEYS.pointer && this.pointerImage) {
      this.pointerImage.setTexture(textureKey);
      return;
    }
    if (textureKey === TEXTURE_KEYS.center && this.spinButtonBg) {
      this.spinButtonBg.setTexture(textureKey);
      return;
    }
    if (textureKey === TEXTURE_KEYS.rim && this.rimImage) {
      this.rimImage.setTexture(textureKey);
    }
  }

  private isPreviewHost(): boolean {
    return window.parent !== window;
  }

  private revokeLogoObjectUrl(): void {
    if (this.logoObjectUrl) {
      URL.revokeObjectURL(this.logoObjectUrl);
      this.logoObjectUrl = null;
    }
  }

  private async ensureLogoLoaded(): Promise<void> {
    const url = this.runtimeConfig.logoUrl?.trim() ?? "";
    if (!url) {
      return;
    }

    if (this.textures.exists(LOGO_TEXTURE_KEY) && url === this.loadedLogoUrl) {
      this.applyLogoTexture();
      if (this.wheelContainer) {
        this.layoutWorld();
      }
      return;
    }

    this.loadedLogoUrl = url;

    const resolvedUrl = this.resolveLogoLoadUrl(url);
    if (!resolvedUrl) {
      return;
    }

    if (this.isPreviewHost()) {
      await this.loadLogoViaFetch(resolvedUrl);
      return;
    }

    this.queueLogoLoad(resolvedUrl);
  }

  private async loadLogoViaFetch(resolvedUrl: string): Promise<void> {
    const fetchUrl = resolvedUrl.startsWith("/")
      ? `${window.location.origin}${resolvedUrl}`
      : resolvedUrl;
    const generation = ++this.logoLoadGeneration;

    try {
      const response = await fetch(fetchUrl, { credentials: "same-origin" });
      if (!response.ok || generation !== this.logoLoadGeneration) {
        return;
      }

      const blob = await response.blob();
      if (generation !== this.logoLoadGeneration) {
        return;
      }

      this.revokeLogoObjectUrl();
      const objectUrl = URL.createObjectURL(blob);
      this.logoObjectUrl = objectUrl;

      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          if (generation !== this.logoLoadGeneration) {
            resolve();
            return;
          }

          if (this.textures.exists(LOGO_TEXTURE_KEY)) {
            this.textures.remove(LOGO_TEXTURE_KEY);
          }
          this.textures.addImage(LOGO_TEXTURE_KEY, image);
          this.applyLogoTexture();
          if (this.wheelContainer) {
            this.layoutWorld();
          }
          resolve();
        };
        image.onerror = () => {
          reject(new Error(`Failed to decode logo image: ${fetchUrl}`));
        };
        image.src = objectUrl;
      });
    } catch {
      if (generation === this.logoLoadGeneration) {
        this.queueLogoLoad(resolvedUrl);
      }
    }
  }

  private syncLogoAsset(config: GameConfig): void {
    const url = config.logoUrl?.trim() ?? "";
    if (!url) {
      this.loadedLogoUrl = "";
      this.logoLoadGeneration += 1;
      this.revokeLogoObjectUrl();
      if (this.textures.exists(LOGO_TEXTURE_KEY)) {
        this.textures.remove(LOGO_TEXTURE_KEY);
      }
      this.logoImage?.setVisible(false);
      this.logoFloatTween?.stop();
      if (this.wheelContainer) {
        this.layoutWorld();
      }
      return;
    }

    const urlChanged = url !== this.loadedLogoUrl;
    if (urlChanged) {
      this.logoLoadGeneration += 1;
      this.revokeLogoObjectUrl();
      if (this.textures.exists(LOGO_TEXTURE_KEY)) {
        this.textures.remove(LOGO_TEXTURE_KEY);
      }
    }

    void this.ensureLogoLoaded();

    if (this.wheelContainer) {
      this.layoutWorld();
    }
  }

  private queueLogoLoad(resolvedUrl: string): void {
    this.load.off(Phaser.Loader.Events.COMPLETE, this.boundLogoLoadComplete);
    this.load.once(Phaser.Loader.Events.COMPLETE, this.boundLogoLoadComplete);
    this.load.image(LOGO_TEXTURE_KEY, resolvedUrl);
    if (!this.load.isLoading()) {
      this.load.start();
    }
  }

  private resolveLogoLoadUrl(url: string): string | null {
    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }

    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("mashedgames-studio://") ||
      trimmed.startsWith("./") ||
      trimmed.startsWith("../")
    ) {
      return trimmed;
    }

    if (trimmed.startsWith("/game-assets/")) {
      return trimmed;
    }

    const relativePath = trimmed.replace(/^\//, "");
    if (!isProjectRelativeAssetPath(relativePath)) {
      return trimmed.startsWith("/") ? trimmed : null;
    }

    const encodedPath = encodeURIComponent(relativePath);

    if (this.isPreviewHost()) {
      const projectId = this.runtimeConfig.projectId?.trim();
      if (projectId) {
        return `/api/projects/${encodeURIComponent(projectId)}/asset?path=${encodedPath}`;
      }

      const templateId = this.runtimeConfig.activeTemplateId?.trim() || "lucky-wheel";
      return `/api/templates/${encodeURIComponent(templateId)}/asset?path=${encodedPath}`;
    }

    const projectId = this.runtimeConfig.projectId?.trim();
    if (projectId) {
      return resolveStudioAssetUrl(relativePath, projectId);
    }

    return `./${relativePath}`;
  }

  private applyLogoTexture(): void {
    if (!this.textures.exists(LOGO_TEXTURE_KEY)) {
      return;
    }

    if (!this.logoImage) {
      this.logoImage = this.add
        .image(0, 0, LOGO_TEXTURE_KEY)
        .setDepth(6);
    } else {
      this.logoImage.setTexture(LOGO_TEXTURE_KEY);
    }

    this.logoImage.setVisible(true);
  }

  private restartLogoFloat(): void {
    if (!this.logoImage?.visible) {
      return;
    }

    this.logoFloatTween?.stop();
    this.logoImage.setY(this.logoAnchorY);
    this.logoFloatTween = this.tweens.add({
      targets: this.logoImage,
      y: this.logoAnchorY - 10,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private spinButtonColorValue(
    fieldKey: "spinButtonColor" | "spinButtonHighlightColor" | "spinButtonBorderColor",
    fallbackHex: string,
  ): number {
    const configured = this.stringField(this.runtimeConfig, fieldKey, "");
    const hex =
      configured ||
      (fieldKey === "spinButtonColor" ? this.runtimeConfig.themeColor : fallbackHex);
    return Phaser.Display.Color.HexStringToColor(hex).color;
  }

  private updateSpinButtonStyle(): void {
    if (!this.spinButtonLabel) {
      return;
    }

    const configuredLabel = this.stringField(
      this.runtimeConfig,
      "spinButtonLabel",
      "",
    );
    const label =
      configuredLabel ||
      (typeof this.runtimeConfig.ctaLabel === "string" &&
      this.runtimeConfig.ctaLabel.trim().length > 0
        ? this.runtimeConfig.ctaLabel
        : DEFAULT_SPIN_BUTTON_LABEL);
    const color = this.stringField(
      this.runtimeConfig,
      "spinButtonTextColor",
      DEFAULT_SPIN_BUTTON_TEXT_COLOR,
    );
    const bold = this.booleanField(this.runtimeConfig, "spinButtonLabelBold", true);
    const italic = this.booleanField(this.runtimeConfig, "spinButtonLabelItalic", false);
    const underline = this.booleanField(
      this.runtimeConfig,
      "spinButtonLabelUnderline",
      false,
    );

    this.spinButtonLabel.setText(label);
    this.spinButtonLabel.setColor(color);
    this.spinButtonLabel.setFontStyle(
      `${bold ? "bold " : ""}${italic ? "italic" : ""}`.trim() || "normal",
    );
    this.spinButtonLabel.setStyle({
      stroke: "#00000055",
      strokeThickness: 2,
      underline: underline,
    });
  }

  private startSpinButtonPulse(): void {
    if (this.phase !== "ready" || !this.spinButtonContainer) {
      return;
    }

    this.spinButtonPulseTween?.stop();
    this.spinButtonContainer.setScale(1);
    this.spinButtonPulseTween = this.tweens.add({
      targets: this.spinButtonContainer,
      scale: 1.04,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private createTextures(): void {
    if (!this.hasCustomAsset(this.runtimeConfig, TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.pointer])) {
      this.ensurePointerTexture(TEXTURE_KEYS.pointer);
    }
    if (!this.hasCustomAsset(this.runtimeConfig, TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.center])) {
      this.ensureCenterTexture(TEXTURE_KEYS.center);
    }
    if (!this.hasCustomAsset(this.runtimeConfig, TEXTURE_CONFIG_FIELDS[TEXTURE_KEYS.rim])) {
      this.ensureRimTexture(TEXTURE_KEYS.rim);
    }
    this.ensureConfettiTexture(TEXTURE_KEYS.confetti);
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

    if (textureKey === TEXTURE_KEYS.pointer) {
      this.ensurePointerTexture(textureKey);
      return;
    }
    if (textureKey === TEXTURE_KEYS.center) {
      this.ensureCenterTexture(textureKey);
      return;
    }
    if (textureKey === TEXTURE_KEYS.rim) {
      this.ensureRimTexture(textureKey);
    }
  }

  private ensurePointerTexture(key: string): void {
    if (this.textures.exists(key)) {
      return;
    }

    const size = 64;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xef4444, 1);
    // Wide base at top (mount), tip at bottom pointing down toward the wheel.
    graphics.fillTriangle(size / 2, size - 4, 10, 10, size - 10, 10);
    graphics.lineStyle(2, 0xffffff, 0.9);
    graphics.strokeTriangle(size / 2, size - 4, 10, 10, size - 10, 10);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private ensureCenterTexture(key: string): void {
    if (this.textures.exists(key)) {
      return;
    }

    const width = 240;
    const height = 64;
    const radius = height / 2;
    const color = this.spinButtonColorValue("spinButtonColor", this.runtimeConfig.themeColor);
    const configuredHighlight = this.stringField(
      this.runtimeConfig,
      "spinButtonHighlightColor",
      "",
    );
    const lightened = configuredHighlight
      ? this.spinButtonColorValue("spinButtonHighlightColor", configuredHighlight)
      : Phaser.Display.Color.ValueToColor(color).lighten(14).color;
    const darkened = Phaser.Display.Color.ValueToColor(color).darken(18).color;
    const borderColor = this.spinButtonColorValue(
      "spinButtonBorderColor",
      DEFAULT_SPIN_BUTTON_BORDER_COLOR,
    );
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0x000000, 0.28);
    graphics.fillRoundedRect(8, 10, width - 8, height - 4, radius);
    graphics.fillStyle(darkened, 1);
    graphics.fillRoundedRect(4, 6, width - 8, height - 8, radius);
    graphics.fillStyle(color, 1);
    graphics.fillRoundedRect(4, 4, width - 8, height - 10, radius);
    graphics.fillStyle(lightened, 0.42);
    graphics.fillRoundedRect(14, 8, width - 28, (height - 16) * 0.42, radius - 6);
    graphics.lineStyle(2, borderColor, 0.75);
    graphics.strokeRoundedRect(4, 4, width - 8, height - 8, radius);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private ensureRimTexture(key: string): void {
    if (this.textures.exists(key)) {
      return;
    }

    const size = 512;
    const radius = size / 2;
    const color = Phaser.Display.Color.HexStringToColor(this.runtimeConfig.themeColor)
      .color;
    const lightened = Phaser.Display.Color.ValueToColor(color).lighten(15).color;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.lineStyle(20, lightened, 1);
    graphics.strokeCircle(radius, radius, radius - 12);
    graphics.lineStyle(6, 0xffffff, 0.65);
    graphics.strokeCircle(radius, radius, radius - 4);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private ensureConfettiTexture(key: string): void {
    if (this.textures.exists(key)) {
      return;
    }

    const width = 8;
    const height = 8;
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRoundedRect(0, 0, width, height, 2);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
