import {defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.spec.ts"],
    // the feeds drop and recreate their tables in one shared database, so they cannot run side by side
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000
  }
});