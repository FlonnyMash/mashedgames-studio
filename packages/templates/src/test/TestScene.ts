import Phaser from "phaser";

export const TEST_SCENE_KEY = "test-scene";

export interface TestSceneInitData {
  // Add init data fields here
}

export class TestScene extends Phaser.Scene {
  constructor() {
    super({ key: TEST_SCENE_KEY });
  }

  preload(): void {
    // Load assets for test here
  }

  create(_data?: TestSceneInitData): void {
    this.cameras.main.setBackgroundColor("#0f172a");
  }

  update(_time: number, _delta: number): void {
    // Game loop logic for test
  }
}
