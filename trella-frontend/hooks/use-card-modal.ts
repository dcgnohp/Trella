import { create } from "zustand";

import type { CardWithList } from "@/types";

/**
 * Modal store for the per-card detail dialog (Req 16.3).
 *
 * Phase 1 of the backend-modular-refactor removes the deleted
 * `/api/cards/[cardId]` route handler that the modal used to fetch its data
 * from. The backend offers no `GET /cards/{id}` endpoint either (only
 * POST/PATCH/DELETE/copy/reorder), so the modal now consumes card data that
 * the parent board page already loaded via `BoardsService.Boards_boardsGetBoard`
 * — `CardItem` passes the full `CardWithList` (the card plus its list's title)
 * into `onOpen`, the modal renders directly from the store, and `setCard`
 * lets `Header` / `Description` keep the dialog in sync after a successful
 * `updateCard` server action without hitting the network.
 */
type CardModalStore = {
  id?: string;
  card?: CardWithList;
  isOpen: boolean;
  onOpen: (card: CardWithList) => void;
  onClose: () => void;
  setCard: (card: CardWithList) => void;
};

export const useCardModal = create<CardModalStore>((set) => ({
  id: undefined,
  card: undefined,
  isOpen: false,
  onOpen: (card) => set({ isOpen: true, id: card.id, card }),
  onClose: () => set({ isOpen: false, id: undefined, card: undefined }),
  setCard: (card) => set({ card, id: card.id }),
}));
