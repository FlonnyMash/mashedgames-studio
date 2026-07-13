import Phaser from "phaser";

export const NEWTEST_SCENE_KEY = "newtest-scene";

export interface NewtestSceneInitData {
  // Add init data fields here
}

export class NewtestScene extends Phaser.Scene {
  constructor() {
    super({ key: NEWTEST_SCENE_KEY });
  }

  preload(): void {
    // Load assets for NewTest here
  }

  create(_data?: NewtestSceneInitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for NewTest
  }
}
