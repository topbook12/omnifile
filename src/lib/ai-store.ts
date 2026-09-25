/**
 * Tiny zustand store shared by the AI settings dialog and any AI tool.
 * Tools call `useAiStore.getState().openDialog()` from their
 * "set your API key" notice; the Tools Hub renders the dialog once.
 */
import { create } from 'zustand'

interface AiStoreState {
  dialogOpen: boolean
  openDialog: () => void
  closeDialog: () => void
}

export const useAiStore = create<AiStoreState>((set) => ({
  dialogOpen: false,
  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}))
