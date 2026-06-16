/**
 * Builds the SDK method name for a generated operation.
 *
 * The legacy (`legacy/axios`) client used here invokes `methodNameBuilder` with
 * the legacy `Operation`, which carries `name` (operationId-derived) and
 * `service` (tag-derived). `@hey-api/openapi-ts` types the argument as a wider
 * union, so the config wraps this helper and narrows the argument there.
 */
export type MethodNameBuilderOperation = {
  name?: string
  service?: string
}

export function methodNameBuilder(operation: MethodNameBuilderOperation): string {
  const service = operation.service ?? ""
  const name = operation.name ?? ""
  const raw = `${service}_${name}`

  // Normalize to a valid TS identifier: letters, numbers, underscore only.
  const sanitized = raw
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (!sanitized) {
    return "unnamed_operation"
  }

  if (/^[0-9]/.test(sanitized)) {
    return `op_${sanitized}`
  }

  return sanitized
}
