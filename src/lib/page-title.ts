import { createContext, useContext } from "react"

/**
 * Lets the page's large title (PageHeader) tell the phone top bar whether it
 * has scrolled out of view, so the compact bar can fade in the title — the
 * iOS "large title" pattern.
 */
export type PageTitleState = {
  largeTitleHidden: boolean
  setLargeTitleHidden: (hidden: boolean) => void
}

export const PageTitleContext = createContext<PageTitleState>({
  largeTitleHidden: false,
  setLargeTitleHidden: () => {},
})

export function usePageTitle(): PageTitleState {
  return useContext(PageTitleContext)
}
