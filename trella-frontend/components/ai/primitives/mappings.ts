// Pure, framework-free mapping helpers for the AI primitives.
// Kept free of React/@atlaskit imports so they can be unit-tested in a
// node-only environment (no DOM, no CJS component modules to transform).

/** ADS Lozenge appearances we use for status tones. */
export type LozengeAppearance =
  | 'default'
  | 'inprogress'
  | 'moved'
  | 'new'
  | 'removed'
  | 'success';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export type Priority = 'low' | 'medium' | 'high';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

/** Pure mapping from a semantic tone to an ADS Lozenge appearance. */
export function statusAppearance(tone: StatusTone): LozengeAppearance {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'moved';
    case 'danger':
      return 'removed';
    case 'neutral':
      return 'default';
  }
}

/** Pure mapping from a recommendation/action priority to an ADS appearance. */
export function priorityAppearance(priority: Priority): LozengeAppearance {
  switch (priority) {
    case 'low':
      return 'default';
    case 'medium':
      return 'moved';
    case 'high':
      return 'removed';
  }
}

/** Pure mapping from a risk severity to a human label + ADS text color token. */
export function severityMeta(severity: Severity): { label: string; colorToken: string } {
  switch (severity) {
    case 'low':
      return { label: 'Low', colorToken: 'color.text.success' };
    case 'medium':
      return { label: 'Medium', colorToken: 'color.text.warning' };
    case 'high':
      return { label: 'High', colorToken: 'color.text.danger' };
    case 'critical':
      return { label: 'Critical', colorToken: 'color.text.danger' };
  }
}

/** Clamp a number into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pure: turn a 0–1 confidence into an integer percentage (0–100). */
export function formatConfidence(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100);
}
