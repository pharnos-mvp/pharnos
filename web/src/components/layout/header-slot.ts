import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

/**
 * Slot d'en-tête applicatif : permet à une page (ex. le montage CTD) d'injecter un contenu
 * — typiquement son titre — dans le bandeau du haut, **sur la même ligne que le profil**
 * (façon Google Docs). La page appelle le setter dans un effet et le remet à `null` au démontage.
 */
export type HeaderSlotSetter = Dispatch<SetStateAction<ReactNode>>

export const HeaderSlotContext = createContext<HeaderSlotSetter | null>(null)

export function useHeaderSlot(): HeaderSlotSetter | null {
  return useContext(HeaderSlotContext)
}
