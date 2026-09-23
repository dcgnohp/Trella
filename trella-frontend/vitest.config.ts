import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["lib/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Mirror the `@/*` path alias declared in tsconfig.json so tests can
    // import modules (e.g. `@/lib/client`) the same way runtime code does.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
