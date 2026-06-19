import { create } from "zustand";

import type { CardWithList } from "@/types";

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
