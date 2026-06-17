import Phaser from "phaser";

export const GG_SCENE_KEY = "gg-scene";

export interface GgSceneInitData {
  // Add init data fields here
}

export class GgScene extends Phaser.Scene {
  constructor() {
    super({ key: GG_SCENE_KEY });
  }

  preload(): void {
    // Load assets for gg here
  }

  create(_data?: GgSceneInitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for gg
  }
}
