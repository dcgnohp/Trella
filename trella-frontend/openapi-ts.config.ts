import { defineConfig } from "@hey-api/openapi-ts"

import { methodNameBuilder as buildMethodName } from "./lib/codegen/method-name-builder"

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
      // Wrap so the argument is inferred from openapi-ts's signature, then
      // narrow to the fields the legacy client actually provides.
      methodNameBuilder: (operation) =>
        buildMethodName({
          name: (operation as { name?: string }).name,
          service: (operation as { service?: string }).service,
        }),
    },
    {
      name: "@hey-api/schemas",
      type: "json",
    },
  ],
})
