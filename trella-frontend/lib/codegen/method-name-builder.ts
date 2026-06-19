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
