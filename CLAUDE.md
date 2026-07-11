# Trella Project Rules

## 1. Design System — Atlassian Design System (ADS)

All frontend work MUST follow [Atlassian Design System](https://atlassian.design):

- **Icons**: use ADS icon set only. No custom SVGs or third-party icon libs unless ADS has no equivalent.
- **Components**: prefer ADS components (Button, Badge, Lozenge, Modal, etc.) over custom-built ones.
- **Spacing**: use ADS spacing tokens (`space.050` = 4px, `space.100` = 8px, `space.200` = 16px, etc.). No hardcoded `px` values for spacing.
- **Typography**: follow ADS type scale and font tokens.
- **Color**: use ADS color tokens only (e.g., `color.background.neutral`, `color.text.subtle`). No raw hex values.
- **Layout**: follow ADS grid and layout guidelines.

When in doubt about a token or component, check https://atlassian.design before implementing.

---

## 2. Page Behaviors — Always Ask First

Before implementing any new page or significant UI interaction, **ask the user to clarify behaviors**:

- Scroll behavior (infinite scroll, pagination, virtual scroll?)
- Hover states (tooltip, highlight, preview?)
- Click / selection behavior
- Loading states (skeleton, spinner, empty state?)
- Error states
- Responsive breakpoints
- Animations / transitions

Do NOT invent behaviors. If no behavior spec is given, pause and ask. Example prompt:
> "Before I build this page, I need to clarify a few behaviors: [list questions]. What should happen for each?"

---

## 3. UI Reference Images — Follow Exactly

When the user provides a UI design image or screenshot:

- **Implement pixel-accurately** against the provided image. Do not add, remove, or rearrange elements.
- If something in the image conflicts with ADS tokens, flag it and ask — do not silently override.
- Do not add extra features, sections, or components not visible in the image.
- If the image is ambiguous in a specific area, ask before guessing.

---

## 4. Verification — Full Browser Automation Test

After any frontend change, verification is **not** complete until a browser automation test passes:

- Use the Chrome DevTools MCP (or Playwright/browser tool available in session) to drive the actual UI.
- Walk through the full affected flow end-to-end: navigate to the page, interact with all tabs/sections/states visible.
- Check that rendered UI matches the reference image / expected behavior.
- If visual discrepancies exist, fix them before reporting done.
- TypeScript type-checking and unit tests are **supplementary**, not a substitute for visual verification.

Minimum verification checklist per page:
- [ ] Page loads without console errors
- [ ] All tabs/sections render correct content
- [ ] Interactive elements (buttons, inputs, modals) behave correctly
- [ ] Responsive layout holds at target viewport
- [ ] No visual regression vs. reference image
