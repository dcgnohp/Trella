import { defineConfig } from "@hey-api/openapi-ts"

import { methodNameBuilder } from "./lib/codegen/method-name-builder"

export default defineConfig({
  input: "./openapi.json",
  output: "./lib/client",

  plugins: [
    "legacy/axios",
    {
      name: "@hey-api/sdk",
      // NOTE: this doesn't allow tree-shaking
      asClass: true,
      operationId: true,
      classNameBuilder: "{{name}}Service",
      methodNameBuilder: (operation) => {
        // @hey-api types do not surface name/service publicly; the runtime
        // shape is `{ name: string; service: string; ... }`. Cast through the
        // shared builder so the logic is unit-testable.
        const op = operation as unknown as {
          name: string
          service: string
        }
        return methodNameBuilder({ name: op.name, service: op.service })
      },
    },
    {
      name: "@hey-api/schemas",
      type: "json",
    },
  ],
})
