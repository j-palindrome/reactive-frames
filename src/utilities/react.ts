import { useEffect } from 'react'
import { useContext } from 'react'
import invariant from 'tiny-invariant'

export const useEventListener = <K extends keyof WindowEventMap>(
  listener: K,
  func: (data: WindowEventMap[K]) => void,
  dependencies: any[] = []
) => {
  useEffect(() => {
    window.addEventListener(listener, func)
    return () => window.removeEventListener(listener, func)
  }, dependencies)
}

export function useInvariantContext<T>(
  ctx: React.Context<T>,
  invariantMessage?: string
) {
  const context = useContext(ctx)
  invariant(context, invariantMessage)
  return context
}
