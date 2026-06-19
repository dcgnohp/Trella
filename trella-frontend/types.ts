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

// `cards` is narrowed to required because the backend always returns an array; the drag-and-drop reducer mutates it in place.
export type ListWithCards = Omit<GeneratedListWithCards, "cards"> & {
  cards: TaskCardPublic[];
};

// Legacy shape for the card modal — only `list.title` is referenced.
export type CardWithList = Card & { list: { title: string } };

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
