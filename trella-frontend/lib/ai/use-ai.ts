import { useMutation } from '@tanstack/react-query';

/** Request body for `POST /api/v1/ai/generate`. `prompt` is the name of a
 *  server-side prompt template; `variables` fill its `{{placeholders}}`. */
export interface AiGenerateRequest {
  prompt: string;
  variables?: Record<string, string>;
  model?: string;
}

/** Shape returned by the backend (camelCase, per CamelModel). */
export interface AiGenerateResponse {
  content: string;
  model: string;
  provider: string;
  latencyMs: number;
}

/** Exported for unit testing; prefer the `useAi` hook in components. */
export async function postGenerate(
  body: AiGenerateRequest,
): Promise<AiGenerateResponse> {
  // Relative URL -> Next.js catch-all proxy (app/api/v1/[[...path]]/route.ts),
  // which forwards to the backend with the httpOnly auth cookie as a bearer.
  const res = await fetch('/api/v1/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data?.detail?.message ?? data?.detail ?? message;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(message);
  }

  return (await res.json()) as AiGenerateResponse;
}

/** Non-streaming AI generation. Exposes TanStack Query mutation state
 *  (`isPending`, `isError`, `error`, `data`, `reset`). */
export function useAi() {
  return useMutation<AiGenerateResponse, Error, AiGenerateRequest>({
    mutationFn: postGenerate,
  });
}
