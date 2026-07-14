import Phaser from "phaser";

export const LUCKY_WHEEL_SCENE_KEY = "lucky-wheel-scene";

export interface LuckyWheelSceneInitData {
  // Add init data fields here
}

export class LuckyWheelScene extends Phaser.Scene {
  constructor() {
    super({ key: LUCKY_WHEEL_SCENE_KEY });
  }

  preload(): void {
    // Load assets for Lucky Wheel here
  }

  create(_data?: LuckyWheelSceneInitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for Lucky Wheel
  }
}
