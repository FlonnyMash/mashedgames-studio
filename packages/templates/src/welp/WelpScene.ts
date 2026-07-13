import Phaser from "phaser";

export const WELP_SCENE_KEY = "welp-scene";

export interface WelpSceneInitData {
  // Add init data fields here
}

export class WelpScene extends Phaser.Scene {
  constructor() {
    super({ key: WELP_SCENE_KEY });
  }

  preload(): void {
    // Load assets for welp here
  }

  create(_data?: WelpSceneInitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for welp
  }
}
