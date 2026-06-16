/**
 * Domain type aliases (Requirements 5.7, 6.7, 7.7, 8.6).
 *
 * Phase 1 of the backend-modular-refactor replaces the Prisma client + mocked
 * `@/lib/db` with a generated TypeScript client (`lib/client/`) produced from
 * the FastAPI OpenAPI schema. To minimise churn in long-standing UI components
 * (`BoardNavbar`, `BoardTitleForm`, `ListItem`, `CardItem`, `ListHeader`,
 * `ListOptions`, …) we keep the historical names `Board` / `List` / `Card` /
 * `AuditLog` / `ListWithCards` / `CardWithList` and re-bind them to the
 * generated API shapes.
 *
 *  - `Board`                ← `BoardPublic`     (camelCase, ISO-string dates,
 *                              nullable image fields).
 *  - `List`                 ← `ListPublic`.
 *  - `Card`                 ← task_cards `CardPublic` (canonical CRUD response).
 *  - `AuditLog`             ← `AuditLogPublic`  (string `action` /
 *                              `entityType`).
 *  - `ListWithCards`        ← generated `ListWithCards` with the `cards`
 *                              array narrowed to required (the backend always
 *                              returns it sorted ascending — Req 5.2).
 *  - `CardWithList`         legacy modal shape: `Card & { list: { title } }`.
 *                              The card-modal (PART 2) currently consumes this
 *                              and will be rewritten against the generated
 *                              client; the alias keeps the modal type-clean
 *                              until then.
 */

import type {
  AuditLogPublic,
  BoardPublic,
  ListPublic,
  ListWithCards as GeneratedListWithCards,
  app__schemas__task_cards_schema__CardPublic as TaskCardPublic,
} from "@/lib/client";

export type Board = BoardPublic;
export type List = ListPublic;
export type Card = TaskCardPublic;
export type AuditLog = AuditLogPublic;

/**
 * `ListWithCards` is the per-list payload nested inside `BoardDetail` and the
 * client-side type fed to `ListContainer` / `ListItem`. The generated schema
 * marks `cards` as optional, but the backend (Req 5.2) always serialises an
 * array (possibly empty) ordered by `order` ascending, so we narrow the type
 * to a required, mutable array — the drag-and-drop reducer in
 * `list-container.tsx` mutates `cards.order` / `cards.listId` in place.
 *
 * The `cards` element type is the canonical `Card` (task_cards `CardPublic`)
 * so consumers like `<CardItem data={card} />` can pass elements through
 * without a structural mismatch (the `BoardDetail`-nested `CardPublic`
 * variant only differs in `description?` optionality, which the page
 * normalises before constructing this shape).
 */
export type ListWithCards = Omit<GeneratedListWithCards, "cards"> & {
  cards: TaskCardPublic[];
};

/**
 * Card-with-list shape consumed by the legacy `components/modals/card-modal`
 * (PART 2). Only the list `title` is referenced by the modal header, so the
 * `list` projection is intentionally narrow; PART 2 will replace this with
 * direct `Boards_boardsGetBoard` lookups.
 */
export type CardWithList = Card & { list: { title: string } };

/**
 * Backend audit-log enum values, kept as string-literal unions matching the
 * `action` / `entity_type` fields of `AuditLogPublic` (which serialise as
 * plain strings, not Python enums).
 */
export const ACTION = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
} as const;
export type ACTION = (typeof ACTION)[keyof typeof ACTION];

export const ENTITY_TYPE = {
  BOARD: "BOARD",
  LIST: "LIST",
  CARD: "CARD",
} as const;
export type ENTITY_TYPE = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE];
