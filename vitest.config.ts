import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    pool: "threads",
    maxWorkers: 1,
    // Zod's conditional ESM package must be transformed by Vite in this runtime.
    // Native externalization causes Vitest workers to stall before test execution.
    server: {
      deps: {
        inline: ["zod"],
      },
    },
  },
});
