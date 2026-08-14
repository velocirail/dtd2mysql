import {configDefaults, defineConfig} from "vitest/config";

export default defineConfig({
  test: {
    // the integration tests need a database, they run from vitest.integration.config.ts instead
    exclude: [...configDefaults.exclude, "test/integration/**"]
  }
});