import { z } from "zod";

/**
 * Per-field validation errors keyed by input field name (Requirement 13.7).
 *
 * Produced from a Zod `safeParse` failure and surfaced to the client via
 * `useAction` so forms can render field-level messages.
 */
export type FieldErrors<T> = {
  [K in keyof T]?: string[];
};

/**
 * Uniform return contract for every server action.
 *
 * Exactly one of the three is meaningful at a time:
 *  - `fieldErrors` — input failed Zod validation.
 *  - `error`       — the action ran but failed (e.g. backend returned 4xx).
 *  - `data`        — the action succeeded; carries the typed payload.
 */
export type ActionState<TInput, TOutput> = {
  fieldErrors?: FieldErrors<TInput>;
  error?: string | null;
  data?: TOutput;
};

/**
 * Wrap a handler with Zod input validation, preserving the `ActionState`
 * contract consumed by `hooks/use-action.ts`.
 *
 * The schema is validated first; on failure the flattened field errors are
 * returned without invoking the handler. On success the parsed (typed) data is
 * forwarded to the handler.
 */
export const createSafeAction = <TInput, TOutput>(
  schema: z.Schema<TInput>,
  handler: (validatedData: TInput) => Promise<ActionState<TInput, TOutput>>,
) => {
  return async (data: TInput): Promise<ActionState<TInput, TOutput>> => {
    const validationResult = schema.safeParse(data);
    if (!validationResult.success) {
      return {
        fieldErrors: validationResult.error.flatten()
          .fieldErrors as FieldErrors<TInput>,
      };
    }

    return handler(validationResult.data);
  };
};
